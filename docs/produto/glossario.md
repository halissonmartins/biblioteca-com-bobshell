# Glossário do Domínio — Sistema de Biblioteca

> Linguagem ubíqua do projeto. Cada termo tem uma definição única.
> Todo código, banco de dados e documentação devem usar **exatamente** estes termos.
> Ambiguidade aqui vira três tabelas no banco — definir antes do schema (E2).

---

## Termos do domínio

| Termo | Definição canônica |
|---|---|
| **Livro** | Obra intelectual identificada por ISBN. Entidade lógica — não representa uma cópia física. |
| **Cópia** | Exemplar físico de um Livro existente no acervo. Um Livro pode ter zero ou mais Cópias. |
| **Acervo** | Conjunto de todas as Cópias da biblioteca, independente de seu estado. |
| **Autor** | Pessoa que escreveu um ou mais Livros. Entidade própria com identificador único. |
| **Leitor** | Usuário do sistema com papel `leitor`. Pode navegar, reservar e consultar empréstimos. Não opera o balcão. |
| **Bibliotecário** | Usuário do sistema com papel `bibliotecario`. Opera empréstimos e devoluções no balcão. |
| **Usuário** | Qualquer pessoa com conta no sistema. Tem exatamente um papel: `leitor` ou `bibliotecario`. |
| **Disponibilidade** | Número de Cópias de um Livro que não estão nem reservadas nem emprestadas no momento. |
| **Reserva** | Intenção de retirada registrada on-line por um Leitor. Vincula um Leitor a uma Cópia por até 12 horas. |
| **Reserva ativa** | Reserva criada há menos de 12 horas e ainda não convertida em Empréstimo, expirada nem cancelada. |
| **Reserva expirada** | Reserva que atingiu o prazo de 12 horas sem ser convertida. Libera a Cópia de volta ao acervo. Registrada em `expiredAt` pelo job de expiração. |
| **Reserva cancelada** | Reserva que o **Leitor** desistiu antes do prazo (RF-L8). Libera a Cópia na hora, como a expiração — mas é ato de quem reservou, não decurso de prazo. Registrada em `cancelledAt`. Expiração e cancelamento têm campos separados desde a issue #20: enquanto o produto não tinha cancelamento, `cancelledAt` era onde o job gravava a expiração, e as duas coisas eram indistinguíveis. |
| **Empréstimo** | Registro da retirada física de uma Cópia por um Leitor, efetivado por um Bibliotecário no balcão. Vence em 7 dias corridos por padrão (RN-8), ajustável no balcão. |
| **Devolução** | Ato de um Bibliotecário marcar uma Cópia emprestada como devolvida. Libera a Cópia para reserva. |
| **Avaliação** | Texto e nota (1–5) deixados por um Leitor sobre um Livro após leitura. |
| **Catálogo** | Interface de navegação do acervo por título, autor ou gênero. |
| **Ciclo de vida de uma Cópia** | `disponível → reservada → emprestada → disponível`. Toda transição é explícita. |

---

## Estados de uma Cópia

```
disponível  ──[reservar]──►  reservada  ──[emprestar]──►  emprestada
     ▲                            │                            │
     │              [expirar 12h] │ [cancelar]          [devolver]
     │                            │                            │
     └────────────────────────────┴────────────────────────────┘
```

A Cópia reservada volta a `disponível` por dois caminhos, e o estado da Cópia é o
mesmo nos dois: o prazo de 12 horas decorreu (RN-1, job de fundo) ou o Leitor
cancelou (RF-L8). A diferença fica na Reserva, não na Cópia — e é ela que o
Bibliotecário lê para saber se a Cópia voltou por desistência ou por esquecimento.

- `disponível`: pode ser reservada por qualquer Leitor
- `reservada`: bloqueada para o Leitor que reservou; não pode ser reservada por outro
- `emprestada`: fisicamente fora da biblioteca; não pode ser reservada

---

## Termos que NÃO existem neste domínio

Evitar estes termos para não criar ambiguidade com os termos canônicos acima:

| Termo proibido | Use em vez disso |
|---|---|
| "reserva cancelada" para o que venceu | Reserva expirada (o cancelamento é ato do Leitor — RF-L8) |
| "livro disponível" | Livro com Disponibilidade > 0 |
| "exemplar" | Cópia |
| "aluguel" | Empréstimo |
| "reservação" | Reserva |
| "membro" / "cliente" | Leitor ou Bibliotecário (conforme o papel) |
| "retorno" | Devolução |
