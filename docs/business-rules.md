# Regras de negócio — WCKD

Este documento é a fonte da verdade para os cálculos financeiros. Cada regra tem testes no backend Rust
(`src-tauri/src/services/*`), que roda com `cargo test`.

## Valores e datas

- Todo valor monetário é um **inteiro em centavos** (`i64`). Nenhum `float` é usado para guardar ou somar dinheiro.
  O frontend converte o texto digitado ("1.234,56") em centavos por manipulação de string (`parseMoney`).
- Valores de transações, orçamentos, contas e parcelas são sempre **positivos**. O tipo (receita ou despesa) define o sinal.
  Só o saldo inicial pode ser negativo (por exemplo, uma dívida já existente).
- Datas são `YYYY-MM-DD` e meses são `YYYY-MM`. Todo filtro mensal usa o intervalo semiaberto
  `[primeiro dia do mês, primeiro dia do mês seguinte)`. Isso respeita os limites de cada mês, inclusive fevereiro
  bissexto, e a virada do ano.

## Saldo

| Indicador | Definição |
|---|---|
| **Saldo inicial** | Dinheiro que você já tinha na *data de referência*. **Não é receita.** |
| **Saldo disponível (atual)** | Saldo inicial + receitas − despesas com data entre a referência e **hoje** (inclusive). |
| **Saldo no fim do período** | Mesmo cálculo, mas até o último dia do mês ou ano selecionado. Para períodos futuros, aparece como **saldo projetado** e inclui lançamentos já planejados, como parcelas futuras. |
| **Resultado mensal** | Receitas − despesas **do mês**. É diferente do saldo acumulado. |
| **Taxa de economia** | (receitas − despesas) ÷ receitas × 100. Fica indefinida (—) quando não há receita no período. Pode ser negativa. |

- Movimentações com data **anterior** à data de referência continuam nos relatórios mensais, mas **não entram no saldo**.
  Isso evita contar duas vezes o dinheiro que já está no saldo inicial.
- Sem data de referência configurada, o saldo considera todas as movimentações e o saldo inicial é 0.
- Lançamentos com data futura **não** afetam o saldo disponível de hoje.

## Categorias

- Receitas e despesas têm categorias separadas. Um gatilho no banco impede gravar uma transação com uma categoria do tipo errado.
- Os nomes são únicos por tipo, sem diferenciar maiúsculas de minúsculas.
- Uma categoria em uso (por transações, contas recorrentes ou parcelamentos) só é excluída com **reclassificação**.
  Todos os registros vão para a categoria de destino em uma única transação SQL, e os orçamentos do mesmo mês são **somados**.
- É obrigatório manter pelo menos uma categoria de cada tipo.

## Contas recorrentes

- Cadastrar uma conta recorrente é uma **previsão**. Nada vira despesa automaticamente.
- O *primeiro vencimento* define o dia de vencimento. Nos meses curtos, o vencimento cai no último dia do mês:
  uma conta com vencimento no dia 31 vence em 28/02 ou 29/02.
- **Marcar como paga** cria uma despesa vinculada ao par (conta, data de vencimento). O valor pago e a data do pagamento
  podem ser diferentes do previsto (por exemplo, numa conta de luz).
- Um índice único `(recurring_id, recurring_due_date)` impede registrar **duas vezes o mesmo vencimento**.
- **Desfazer pagamento** exclui a despesa gerada.
- Excluir o cadastro **preserva** os pagamentos já feitos como despesas normais.
- Status de um vencimento:
  - *pago*: tem uma despesa vinculada.
  - *em atraso*: a data já passou e o vencimento não foi pago. A lista de atrasos considera os últimos 90 dias.
  - *pendente*: a data ainda não chegou.
- O equivalente mensal é: semanal × 52 ÷ 12, mensal × 1, anual ÷ 12.

## Parcelamentos

- Cada parcela é uma transação de despesa no **mês do seu vencimento**. O valor total nunca é lançado de uma vez.
- O valor total é dividido em centavos inteiros e a diferença de arredondamento vai para a **1ª parcela**.
  Exemplo: R$ 100,00 em 3x vira 33,34 + 33,33 + 33,33. A soma é sempre exatamente o total.
- A parcela *k* vence na data da 1ª parcela + *k* meses, ajustada ao fim do mês quando necessário.
- Parcelas com data até hoje contam como **pagas**. As posteriores contam como **pendentes**.
- Uma parcela pode ter descrição, categoria, data e observação editadas individualmente. O valor e o tipo vêm do
  parcelamento. Uma parcela não pode ser excluída sozinha.
- Editar o parcelamento **regenera** todas as parcelas, em uma transação SQL. Excluir o parcelamento remove todas as parcelas.

## Orçamentos

- Cada orçamento vale para um mês e uma categoria de despesa (`UNIQUE(category_id, month)`). Alterar o orçamento de um mês
  não muda os outros meses.
- O orçamento é apenas uma meta. Ele **nunca altera** os valores gastos.
- Status:
  - *dentro do orçamento*: menos de 80% consumido.
  - *próximo do limite*: de 80% a 100%.
  - *ultrapassado*: mais de 100%.
- "Copiar do mês anterior" só cria os orçamentos que ainda não existem no mês. Nunca sobrescreve.

## Análises

As análises são determinísticas: só usam consultas SQL e cálculos em Rust, sem nenhum serviço externo.
Uma conclusão só aparece quando há dados suficientes. Quando faltam dados, o app mostra o motivo.

| Análise | Requisito mínimo |
|---|---|
| Comparação com o mês anterior | Movimentações nos dois meses |
| Categoria com maior crescimento | Categoria com pelo menos R$ 20 no mês anterior e crescimento de pelo menos 10% |
| Média mensal de despesas | Pelo menos 3 meses com movimentações nos últimos 12 |
| Acima ou abaixo da média | Média disponível e diferença de pelo menos 15% |
| Taxa de economia e comprometimento da renda | Receita no mês |
| Despesas que se repetem | A mesma descrição aparece em pelo menos 3 dos últimos 6 meses. Parcelas e contas recorrentes já cadastradas não entram nessa análise. |
| Evolução do saldo no mês | Saldo definido no início e no fim do mês |

## Integridade

- `PRAGMA foreign_keys = ON` em toda conexão. Categorias usadas não podem ser apagadas (`ON DELETE RESTRICT`).
- Operações com várias alterações usam transação SQL. É o caso de reclassificar categorias, criar ou editar
  parcelamentos e restaurar backups.
- O backend valida toda entrada (valores, datas, tamanhos, tipos), mesmo que o frontend já tenha validado.
- Nenhuma operação apaga dados sem confirmação explícita na interface.
