import { test, expect } from '@playwright/test'
import {
  API,
  apiBookByTitle,
  apiCreateReservation,
  apiGetBook,
  apiErrorOf,
  bearer,
  inDaysISO,
  newActor,
  newActors,
  BIBLIOTECARIO,
  FILA_ULTIMA_COPIA,
  LEITOR_BALCAO_DUPLO,
  LEITOR_CANCELA_CORRIDA,
  LEITOR_CANCELA_TETO,
  LEITOR_DUPLICADA,
  LEITOR_EXPIRACAO,
  LEITOR_TETO,
  LEITOR_ULTIMA_COPIA,
  apiCancelReservation,
  type ReservationDto,
} from './helpers'
import {
  copyStatus,
  countLoansForReservation,
  countReservationsForCopy,
  expireReservation,
  releaseReservation,
} from './db'

/**
 * Regras que só existem no tempo e na concorrência.
 *
 * Nenhuma delas cabe na UI: o navegador não emite duas requisições no mesmo
 * instante e não sabe esperar doze horas. São as duas propriedades de US-03 que
 * ficaram sem teste desde o começo — a última Cópia disputada e o prazo que vence
 * sozinho — mais a Reserva disputada no balcão, os dois limites por Leitor
 * (RN-9 e RN-10) e o cancelamento pelo Leitor (RF-L8, RN-11), que disputa a
 * mesma linha com o balcão. Todas são observadas aqui no sistema real, com o job
 * de expiração de produção rodando no processo da API.
 *
 * Cada cenário tem o **próprio Leitor** (`helpers.ts`, tabela em `AGENTS.md`):
 * desde RN-9 e RN-10 a Reserva é um recurso do Leitor, e um Leitor reaproveitado
 * acumula até a suíte falhar por acumulação em vez de por defeito.
 */

/**
 * RN-10 — teto de Reservas ativas por Leitor. A fonte de verdade é
 * `MAX_ACTIVE_RESERVATIONS_PER_READER`, em
 * `packages/api/src/domain/reservation/reservationService.ts`; aqui se afirma o
 * efeito no contrato, que é o que o Leitor sente.
 */
const TETO_DE_RESERVAS_ATIVAS = 3

test.describe('Regras de negócio no sistema real (RN-1, RN-3, RN-5, RN-6, RN-9, RN-10, RN-11)', () => {
  test('US-03 — a última Cópia é de um Leitor só, ainda que todos peçam ao mesmo tempo', async ({ playwright }) => {
    const dono = await newActor(playwright, LEITOR_ULTIMA_COPIA.email)

    const livro = await apiBookByTitle(dono.ctx, 'O Nome de Deus')
    expect(livro.availableCopies, 'o cenário exige um Livro com 2 Cópias livres').toBe(2)

    // Este Leitor fica com a primeira Cópia — é a Reserva que não pode ser
    // afetada por nada do que vier depois.
    const reservaDoDono = await apiCreateReservation(dono.ctx, dono.token, livro.id)
    expect((await apiGetBook(dono.ctx, livro.id)).availableCopies).toBe(1)

    // Oito tentativas sobre a última Cópia, disparadas juntas. Cada uma vai num
    // contexto HTTP próprio de propósito: um APIRequestContext reaproveita a mesma
    // conexão e enfileira as requisições, o que faria o teste passar por serialização
    // acidental em vez de por correção. Sem o UPDATE condicional na transação, todas
    // encontram a mesma Cópia livre em findAvailableCopy e todas gravam.
    //
    // E oito Leitores DISTINTOS, um por tentativa: RN-9 recusa o Leitor que já tem
    // o Livro, então alternar duas contas faria sete perdedores receberem
    // `DUPLICATE_RESERVATION` — a contagem 1×201 + 7×409 continuaria batendo e o
    // UPDATE condicionado a `status: 'available'`, que é o que protege a última
    // Cópia, ficaria sem cobertura nenhuma. É a asserção do `code` que denuncia.
    const disputantes = await Promise.all(
      FILA_ULTIMA_COPIA.map((leitor) => newActor(playwright, leitor.email)),
    )

    const respostas = await Promise.all(
      disputantes.map((actor) =>
        actor.ctx.post(`${API}/reservations`, {
          headers: bearer(actor.token),
          data: { bookId: livro.id },
        }),
      ),
    )
    const status = respostas.map((r) => r.status())

    expect(status.filter((s) => s === 201), `status recebidos: ${status.join(',')}`).toHaveLength(1)
    expect(status.filter((s) => s === 409)).toHaveLength(7)

    // Quem perdeu recebe a mesma resposta de quem tenta reservar Livro esgotado —
    // perdeu a Cópia, não bateu num limite próprio
    for (const recusada of respostas.filter((r) => r.status() === 409)) {
      expect((await apiErrorOf(recusada)).code).toBe('NO_COPY_AVAILABLE')
    }

    // O acervo não ficou devendo nem sobrando Cópia
    expect((await apiGetBook(dono.ctx, livro.id)).availableCopies).toBe(0)

    // A Cópia vencedora tem exatamente uma Reserva — reserva dupla é invisível pela
    // API (Disponibilidade continua 0) e só aparece olhando a tabela.
    const vencedora = (await respostas.find((r) => r.status() === 201)!.json()).data
      .reservation as ReservationDto
    expect(await countReservationsForCopy(vencedora.copy.id)).toBe(1)
    expect(await copyStatus(vencedora.copy.id)).toBe('reserved')

    // "E minha Reserva não é afetada"
    expect(await countReservationsForCopy(reservaDoDono.copy.id)).toBe(1)
    expect(await copyStatus(reservaDoDono.copy.id)).toBe('reserved')

    // Devolve as duas Cópias ao acervo: o cenário abre afirmando que o Livro tem 2
    // livres, então ele mesmo precisa terminar onde começou — inclusive quando o
    // Playwright repete um teste que falhou.
    await releaseReservation(vencedora.id)
    await releaseReservation(reservaDoDono.id)
    expect((await apiGetBook(dono.ctx, livro.id)).availableCopies).toBe(2)

    await Promise.all(disputantes.map((actor) => actor.dispose()))
    await dono.dispose()
  })

  test('RN-1/RN-5 — Reserva vencida sai da lista do Leitor e a Cópia volta ao acervo', async ({ playwright }) => {
    // O job de expiração roda a cada minuto no processo da API (index.ts). Este é o
    // único teste que espera por ele: nada mais no sistema devolve a Cópia ao acervo,
    // e o teste unitário do job não vê a Disponibilidade subir de novo.
    test.setTimeout(150_000)

    const leitor = await newActor(playwright, LEITOR_EXPIRACAO.email)
    const livro = await apiBookByTitle(leitor.ctx, 'A Paixão Segundo G.H.')
    const disponiveisAntes = livro.availableCopies
    expect(disponiveisAntes).toBeGreaterThan(0)

    const reserva = await apiCreateReservation(leitor.ctx, leitor.token, livro.id)
    expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes - 1)
    expect(await copyStatus(reserva.copy.id)).toBe('reserved')

    const minhasReservas = async (): Promise<string[]> => {
      const res = await leitor.ctx.get(`${API}/me/reservations`, { headers: bearer(leitor.token) })
      expect(res.status()).toBe(200)
      return ((await res.json()).data as Array<{ id: string }>).map((r) => r.id)
    }
    expect(await minhasReservas()).toContain(reserva.id)

    // Adianta o relógio da Reserva: o prazo de 12h passou
    await expireReservation(reserva.id)

    // A lista do Leitor é filtrada por prazo na leitura — some na hora, sem depender
    // do job (RF-L4)
    expect(await minhasReservas()).not.toContain(reserva.id)

    // A Cópia, essa, só volta quando o job passa (RN-5)
    await expect
      .poll(async () => (await apiGetBook(leitor.ctx, livro.id)).availableCopies, {
        timeout: 120_000,
        intervals: [1_000, 2_000, 5_000],
        message: 'o job de expiração deveria devolver a Cópia ao acervo',
      })
      .toBe(disponiveisAntes)

    expect(await copyStatus(reserva.copy.id)).toBe('available')

    // E ela volta reservável de verdade — não é só a contagem que subiu. Para o
    // mesmo Leitor, ainda: a Reserva vencida não conta para RN-9, e é isso que
    // permite pedir o mesmo Livro de novo depois do prazo.
    const denovo = await apiCreateReservation(leitor.ctx, leitor.token, livro.id)
    expect(denovo.id).not.toBe(reserva.id)

    // Termina onde começou — o Livro é compartilhado com o cenário abaixo
    await releaseReservation(denovo.id)
    expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes)

    await leitor.dispose()
  })

  test('RN-6 — a mesma Reserva vira um Empréstimo só, ainda que o balcão peça duas vezes', async ({ playwright }) => {
    const leitor = await newActor(playwright, LEITOR_BALCAO_DUPLO.email)

    // Livro compartilhado com o cenário acima: este teste devolve a Cópia no fim,
    // então a Disponibilidade termina onde começou.
    const livro = await apiBookByTitle(leitor.ctx, 'A Paixão Segundo G.H.')
    const disponiveisAntes = livro.availableCopies
    expect(disponiveisAntes, 'o cenário exige uma Cópia livre').toBeGreaterThan(0)

    const reserva = await apiCreateReservation(leitor.ctx, leitor.token, livro.id)

    // Seis efetivações da MESMA Reserva, disparadas juntas — o duplo clique do
    // balcão e o segundo Bibliotecário atendendo a mesma pessoa são a mesma corrida.
    // Contexto HTTP próprio por requisição pela razão de sempre: um
    // APIRequestContext enfileira as chamadas e o teste passaria por serialização
    // acidental. Sem o UPDATE condicionado a `convertedAt: null` na transação, todas
    // passam pela checagem do serviço e batem no índice único de loans.reservationId
    // — que chegava à borda como 500, não como a recusa que a regra já previa.
    const balcao = await newActors(playwright, BIBLIOTECARIO.email, 6)

    const respostas = await Promise.all(
      balcao.map((bibliotecario) =>
        bibliotecario.ctx.post(`${API}/loans`, {
          headers: bearer(bibliotecario.token),
          data: { reservationId: reserva.id, dueAt: inDaysISO(7) },
        }),
      ),
    )
    const status = respostas.map((r) => r.status())

    expect(status.filter((s) => s === 201), `status recebidos: ${status.join(',')}`).toHaveLength(1)
    expect(status.filter((s) => s === 409)).toHaveLength(5)
    expect(status.filter((s) => s === 500), 'corrida perdida não é defeito de servidor').toHaveLength(0)

    // Quem perdeu recebe a mesma resposta de quem tenta converter uma Reserva já
    // convertida — para o Bibliotecário é a mesma situação
    for (const recusada of respostas.filter((r) => r.status() === 409)) {
      expect((await apiErrorOf(recusada)).code).toBe('CONFLICT')
    }

    // Empréstimo duplo é invisível pela API (a Cópia só pode estar 'loaned' uma vez)
    // e só aparece olhando a tabela
    expect(await countLoansForReservation(reserva.id)).toBe(1)
    expect(await copyStatus(reserva.copy.id)).toBe('loaned')

    // Devolve a Cópia ao acervo — o Livro é compartilhado
    const vencedor = respostas.find((r) => r.status() === 201)!
    const emprestimo = (await vencedor.json()).data.loan as { id: string }
    const devolucao = await balcao[0]!.ctx.patch(`${API}/loans/${emprestimo.id}/return`, {
      headers: bearer(balcao[0]!.token),
    })
    expect(devolucao.status()).toBe(200)
    expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes)

    await Promise.all(balcao.map((bibliotecario) => bibliotecario.dispose()))
    await leitor.dispose()
  })

  test('RN-9 — duas Cópias livres do mesmo Livro, mas uma só é do Leitor, mesmo pedindo junto', async ({ playwright }) => {
    const leitor = await newActor(playwright, LEITOR_DUPLICADA.email)

    // O cenário exige DUAS Cópias livres: com uma só, a segunda tentativa seria
    // recusada por RN-3 e RN-9 ficaria sem prova — o teste passaria pelo motivo
    // errado, que é exatamente o defeito que este arquivo existe para não ter.
    const livro = await apiBookByTitle(leitor.ctx, 'A Hora da Estrela')
    const disponiveisAntes = livro.availableCopies
    expect(disponiveisAntes, 'o cenário exige duas Cópias livres').toBeGreaterThanOrEqual(2)

    // Três pedidos do MESMO Leitor para o MESMO Livro, no mesmo instante. Cada um
    // acha uma Cópia livre DIFERENTE em findAvailableCopy, então não há linha de
    // Cópia em disputa e o UPDATE condicional de RN-3 não recusa ninguém: os três
    // gravariam. Quem serializa é o `SELECT ... FOR UPDATE` na linha do Leitor, e é
    // ele que este teste exercita.
    const contextos = await newActors(playwright, LEITOR_DUPLICADA.email, 3)
    const respostas = await Promise.all(
      contextos.map((actor) =>
        actor.ctx.post(`${API}/reservations`, {
          headers: bearer(actor.token),
          data: { bookId: livro.id },
        }),
      ),
    )
    const status = respostas.map((r) => r.status())

    expect(status.filter((s) => s === 201), `status recebidos: ${status.join(',')}`).toHaveLength(1)
    expect(status.filter((s) => s === 409)).toHaveLength(2)

    // E a recusa nomeia a regra certa: quem perdeu não perdeu a Cópia (havia outra
    // livre) — bateu no próprio limite
    for (const recusada of respostas.filter((r) => r.status() === 409)) {
      expect((await apiErrorOf(recusada)).code).toBe('DUPLICATE_RESERVATION')
    }

    // O acervo perdeu exatamente uma Cópia, não três
    expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes - 1)

    // E o Leitor tem uma Reserva deste Livro na lista dele, não duas nem três
    const minhas = await leitor.ctx.get(`${API}/me/reservations`, { headers: bearer(leitor.token) })
    expect(minhas.status()).toBe(200)
    const desteLivro = ((await minhas.json()).data as ReservationDto[]).filter(
      (r) => r.copy.book.id === livro.id,
    )
    expect(desteLivro).toHaveLength(1)

    // Termina onde começou
    const vencedora = (await respostas.find((r) => r.status() === 201)!.json()).data
      .reservation as ReservationDto
    await releaseReservation(vencedora.id)
    expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes)

    await Promise.all(contextos.map((actor) => actor.dispose()))
    await leitor.dispose()
  })

  test('RN-10 — o teto de Reservas ativas resiste a um pedido a mais disparado junto', async ({ playwright }) => {
    const leitor = await newActor(playwright, LEITOR_TETO.email)

    // Um Livro por pedido, todos diferentes: assim nenhuma recusa pode vir de RN-9
    // nem de RN-3, e o único limite que sobra para explicar a última é o teto. São
    // teto + 1 pedidos — o mínimo para ver a recusa.
    //
    // Dom Casmurro está fora do conjunto de propósito: `contrato-api` estaciona a
    // última Cópia dele numa Reserva vencida, que só volta ao acervo quando o job
    // passa. Um Livro cuja Disponibilidade depende do relógio não serve de
    // pré-condição.
    const titulos = [
      'A Hora da Estrela',
      'Cem Anos de Solidão',
      'O Amor nos Tempos do Cólera',
      'O Processo',
    ]
    expect(titulos).toHaveLength(TETO_DE_RESERVAS_ATIVAS + 1)

    const livros = await Promise.all(titulos.map((t) => apiBookByTitle(leitor.ctx, t)))
    for (const livro of livros) {
      expect(livro.availableCopies, `${livro.title} precisa de Cópia livre`).toBeGreaterThan(0)
    }

    // Um contexto por pedido, como sempre. Contar Reservas do lado de fora da
    // transação não protegeria nada aqui: os quatro pedidos leem o mesmo total sob
    // READ COMMITTED e passam juntos. O `SELECT ... FOR UPDATE` na linha do Leitor
    // é o que os enfileira — sem tocar nos pedidos dos outros Leitores.
    const contextos = await newActors(playwright, LEITOR_TETO.email, livros.length)
    const respostas = await Promise.all(
      contextos.map((actor, i) =>
        actor.ctx.post(`${API}/reservations`, {
          headers: bearer(actor.token),
          data: { bookId: livros[i]!.id },
        }),
      ),
    )
    const status = respostas.map((r) => r.status())

    expect(
      status.filter((s) => s === 201),
      `status recebidos: ${status.join(',')}`,
    ).toHaveLength(TETO_DE_RESERVAS_ATIVAS)
    expect(status.filter((s) => s === 409)).toHaveLength(1)

    // A recusa diz qual é o limite — é o que o Leitor precisa ler para saber o que
    // fazer (RN-10 no PRD: "a recusa diz o limite")
    const recusada = await apiErrorOf(respostas.find((r) => r.status() === 409)!)
    expect(recusada.code).toBe('RESERVATION_LIMIT_REACHED')
    expect(recusada.message).toContain(String(TETO_DE_RESERVAS_ATIVAS))

    // E a lista do Leitor para no teto: o quarto pedido não deixou rastro
    const minhas = await leitor.ctx.get(`${API}/me/reservations`, { headers: bearer(leitor.token) })
    expect(minhas.status()).toBe(200)
    const ativas = (await minhas.json()).data as ReservationDto[]
    expect(ativas).toHaveLength(TETO_DE_RESERVAS_ATIVAS)

    // Termina onde começou: quatro Livros compartilhados com outros cenários (e com
    // a suíte de UI), então as três Cópias voltam ao acervo aqui
    for (const reserva of ativas) {
      await releaseReservation(reserva.id)
    }
    for (const antes of livros) {
      expect((await apiGetBook(leitor.ctx, antes.id)).availableCopies).toBe(antes.availableCopies)
    }

    await Promise.all(contextos.map((actor) => actor.dispose()))
    await leitor.dispose()
  })
  test('RN-11 — cancelar devolve a vaga do teto e libera o Livro para o mesmo Leitor', async ({ playwright }) => {
    const leitor = await newActor(playwright, LEITOR_CANCELA_TETO.email)

    // Mesmos quatro Livros do cenário de RN-10, e pelo mesmo motivo: um por
    // pedido, para que nenhuma recusa possa vir de RN-9 nem de RN-3.
    const titulos = [
      'A Hora da Estrela',
      'Cem Anos de Solidão',
      'O Amor nos Tempos do Cólera',
      'O Processo',
    ]
    const livros = await Promise.all(titulos.map((t) => apiBookByTitle(leitor.ctx, t)))
    for (const livro of livros) {
      expect(livro.availableCopies, `${livro.title} precisa de Cópia livre`).toBeGreaterThan(0)
    }

    // Enche o teto em sequência — aqui o assunto é a consequência do
    // cancelamento, não a corrida (essa é o cenário de RN-10 acima)
    const noTeto: ReservationDto[] = []
    for (const livro of livros.slice(0, TETO_DE_RESERVAS_ATIVAS)) {
      noTeto.push(await apiCreateReservation(leitor.ctx, leitor.token, livro.id))
    }

    const quarto = livros[TETO_DE_RESERVAS_ATIVAS]!
    const recusado = await leitor.ctx.post(`${API}/reservations`, {
      headers: bearer(leitor.token),
      data: { bookId: quarto.id },
    })
    expect(recusado.status()).toBe(409)
    expect((await apiErrorOf(recusado)).code).toBe('RESERVATION_LIMIT_REACHED')

    // RN-11 — cancelar devolve a vaga. Sem isto o Leitor ficaria preso no teto
    // por até 12h por Reservas que ele mesmo já sabe que não vai retirar, e o
    // cancelamento resolveria metade do problema: libera a Cópia, não o Leitor.
    const cancelada = await apiCancelReservation(leitor.ctx, leitor.token, noTeto[0]!.id)
    expect(cancelada.status).toBe('cancelled')

    const agoraVai = await leitor.ctx.post(`${API}/reservations`, {
      headers: bearer(leitor.token),
      data: { bookId: quarto.id },
    })
    expect(agoraVai.status(), 'a vaga cancelada tinha de estar livre').toBe(201)
    const doQuarto = (await agoraVai.json()).data.reservation as ReservationDto

    // RN-9 — e o Livro cancelado volta a ser reservável pelo MESMO Leitor. É a
    // outra metade da regra: "expirada ou cancelada não conta" (PRD, RN-9).
    // Antes de cancelar existir, só a expiração destravava isso — e custava 12h.
    await apiCancelReservation(leitor.ctx, leitor.token, noTeto[1]!.id)
    const denovo = await apiCreateReservation(leitor.ctx, leitor.token, cancelada.copy.book.id)
    expect(denovo.copy.book.id).toBe(cancelada.copy.book.id)
    expect(denovo.id).not.toBe(cancelada.id)

    // Termina onde começou
    for (const reserva of [noTeto[2]!, doQuarto, denovo]) {
      await releaseReservation(reserva.id)
    }
    for (const antes of livros) {
      expect((await apiGetBook(leitor.ctx, antes.id)).availableCopies).toBe(antes.availableCopies)
    }

    await leitor.dispose()
  })

  test('RF-L8 — cancelamento e balcão disputam a mesma Reserva: um vence, nunca os dois', async ({ playwright }) => {
    const leitor = await newActor(playwright, LEITOR_CANCELA_CORRIDA.email)

    const livro = await apiBookByTitle(leitor.ctx, 'A Hora da Estrela')
    const disponiveisAntes = livro.availableCopies
    expect(disponiveisAntes, 'o cenário exige uma Cópia livre').toBeGreaterThan(0)

    const reserva = await apiCreateReservation(leitor.ctx, leitor.token, livro.id)

    // O Leitor desiste pelo celular no exato momento em que o Bibliotecário
    // confirma a efetivação no balcão. As duas escritas querem a MESMA linha de
    // Reserva e a MESMA Cópia, em direções opostas: uma devolve ao acervo, a
    // outra entrega ao Leitor. Sem o UPDATE condicional em cada lado, as duas
    // passam pelas checagens dos serviços e a Cópia termina 'available' com o
    // livro fisicamente fora da biblioteca — a Disponibilidade passaria a mentir
    // para todos os Leitores.
    const [balcao] = await newActors(playwright, BIBLIOTECARIO.email, 1)
    const [leitorCorrida] = await newActors(playwright, LEITOR_CANCELA_CORRIDA.email, 1)

    const [cancelamento, efetivacao] = await Promise.all([
      leitorCorrida!.ctx.patch(`${API}/reservations/${reserva.id}/cancel`, {
        headers: bearer(leitorCorrida!.token),
      }),
      balcao!.ctx.post(`${API}/loans`, {
        headers: bearer(balcao!.token),
        data: { reservationId: reserva.id, dueAt: inDaysISO(7) },
      }),
    ])

    const status = [cancelamento.status(), efetivacao.status()]
    expect(status.filter((s) => s === 200 || s === 201), `status: ${status.join(',')}`).toHaveLength(1)
    expect(status.filter((s) => s === 409)).toHaveLength(1)
    expect(status.filter((s) => s === 500), 'corrida perdida não é defeito de servidor').toHaveLength(0)

    // A Reserva tem um desfecho só, e o estado da Cópia é o que aquele desfecho
    // manda — é aqui que a inconsistência apareceria
    const cancelouPrimeiro = cancelamento.status() === 200
    if (cancelouPrimeiro) {
      expect(await countLoansForReservation(reserva.id)).toBe(0)
      expect(await copyStatus(reserva.copy.id)).toBe('available')
      expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes)
      expect((await apiErrorOf(efetivacao)).code).toBe('CONFLICT')
    } else {
      expect(await countLoansForReservation(reserva.id)).toBe(1)
      expect(await copyStatus(reserva.copy.id)).toBe('loaned')
      expect((await apiErrorOf(cancelamento)).code).toBe('CONFLICT')

      // Devolve a Cópia ao acervo — o Livro é compartilhado com outros cenários
      const emprestimo = (await efetivacao.json()).data.loan as { id: string }
      const devolucao = await balcao!.ctx.patch(`${API}/loans/${emprestimo.id}/return`, {
        headers: bearer(balcao!.token),
      })
      expect(devolucao.status()).toBe(200)
      expect((await apiGetBook(leitor.ctx, livro.id)).availableCopies).toBe(disponiveisAntes)
    }

    await leitorCorrida!.dispose()
    await balcao!.dispose()
    await leitor.dispose()
  })
})
