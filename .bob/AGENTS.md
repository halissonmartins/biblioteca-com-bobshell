# Sistema

- SO: Ubuntu 24.04 LTS executando no WSL2 (Subsistema Windows para Linux)
- Limitado a 8GB de RAM

# Ambiente:

- SDK MAN com JAVA `21.0.11-sem` e `8.0.492-zulu` 
- Maven 3.9
- Git
- Docker
- Docker Compose
- Google Chrome (interface gráfica do WSLg)
- Postman CLI
- db2cli
- Kafka CLI
- shellcheck
- K6 load testing

# Comandos principais

- Abrir o Chrome (WSLg): `chrome`

# Preferências

- Sempre verificar se uma ferramenta ou binário existe antes de sugerir a instalação
- Preferir versões já instaladas em vez de sugerir alternativas
- Usar as versões listadas acima ao gerar arquivos de build, configurações de CI ou Dockerfiles

# Boas práticas implementação
- Seguir os princípios do CLEAN Code
- Seguir os princípios do SOLID 
- Seguir os princípios do YAGNI (You Ain't Gonna Need It) 

# Diretrizes

Diretrizes comportamentais para reduzir erros comuns de codificação em mestrados em Direito. Combine com instruções específicas do projeto, conforme necessário.

**Contraponto:** Estas diretrizes priorizam a cautela em detrimento da velocidade. Para tarefas triviais, use o bom senso.

## 1. Pense antes de programar

**Não faça suposições. Não esconda a confusão. Apresente as vantagens e desvantagens.**

Antes da implementação:
- Exponha suas suposições explicitamente. Em caso de dúvida, pergunte.
- Se existirem múltiplas interpretações, apresente-as - não escolha em silêncio.
- Se existir uma abordagem mais simples, diga-a. Questione-a quando necessário.
- Se algo não estiver claro, pare. Nomeie o que está causando confusão. Pergunte.

2. Simplicidade em Primeiro Lugar

**Código mínimo que resolve o problema. Nada de especulações.**

- Sem funcionalidades além das solicitadas.
- Sem abstrações para código de uso único.
- Nenhuma "flexibilidade" ou "configurabilidade" que não tenha sido solicitada.
- Sem tratamento de erros para cenários impossíveis.
- Se você escrever 200 linhas e elas poderiam ser reduzidas a 50, reescreva.

Pergunte a si mesmo: "Um engenheiro sênior diria que isso é muito complicado?" Se sim, simplifique.

## 3. Alterações Cirúrgicas

**Toque apenas no que for necessário. Limpe apenas a sua própria sujeira.**

Ao editar um código existente:
- Não tente "melhorar" o código, os comentários ou a formatação adjacentes.
- Não refatore o que não está quebrado.
- Mantenha o estilo existente, mesmo que você o fizesse de forma diferente.
- Se você notar código morto não relacionado, mencione-o - não o apague.

Quando suas alterações criam arquivos órfãos:
- Remova as importações/variáveis/funções que SUAS alterações tornaram não utilizadas.
- Não remova código morto preexistente, a menos que seja solicitado.

O teste: Cada linha alterada deve estar diretamente relacionada à solicitação do usuário.

## 4. Execução Orientada a Objetivos

**Defina os critérios de sucesso. Repita o processo até que sejam verificados.**

Transformar tarefas em objetivos verificáveis:
- "Adicionar validação" → "Escrever testes para entradas inválidas e, em seguida, fazê-los passar"
- "Corrigir o bug" → "Escreva um teste que o reproduza e, em seguida, faça com que ele seja aprovado"
- "Refatorar X" → "Garantir que os testes passem antes e depois"

Para tarefas com várias etapas, apresente um plano resumido:
```
1. [Etapa] → verificar: [verificar]
2. [Etapa] → verificar: [verificar]
3. [Etapa] → verificar: [verificar]
```

Critérios de sucesso robustos permitem que você crie ciclos independentes. Critérios fracos ("faça funcionar") exigem esclarecimentos constantes.

---

**Estas diretrizes estão funcionando se:** houver menos alterações desnecessárias nas diferenças, menos reescritas devido à complexidade excessiva e as perguntas para esclarecimento forem feitas antes da implementação, em vez de depois dos erros.
