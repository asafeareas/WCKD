# Histórico de decisões

Registro das decisões de produto e de técnica, para orientar a evolução do WCKD.

## 2026-11-08 — v0.1.0 (MVP)

- **Saldo disponível vai só até hoje.** Lançamentos futuros, como parcelas, aparecem nos meses futuros como projeção, mas não reduzem o saldo atual.
- **Contas recorrentes não geram despesas automaticamente.** O usuário marca cada vencimento como pago e pode ajustar o valor e a data. Isso separa previsão de gasto realizado e evita duplicações.
- **Parcelas são pagas por data.** Uma parcela com vencimento até hoje conta como paga, sem marcação manual, porque representa uma compra já feita (cartão ou carnê).
- **A diferença de arredondamento das parcelas vai para a 1ª parcela.**
- **Excluir uma categoria em uso exige reclassificação.** Os orçamentos são somados aos da categoria de destino.
- **Transferências entre contas não foram implementadas.** O MVP tem uma única "carteira". Se forem criadas no futuro, devem ser um terceiro tipo que não conte como receita nem como despesa.
- ~~Somente tema escuro.~~ Substituída em 2026-11-08 (ver abaixo).
- **Diálogos de arquivo são abertos pelo Rust** (`tauri-plugin-dialog`), para manter as permissões do frontend mínimas.
- **Não há dados de demonstração.** O app começa vazio, só com as categorias padrão.

## 2026-11-08 — Redesign "trash"

- **Estética desenhada à mão no Paint**, seguindo o ícone do demônio verde. Usa contornos tremidos (Rough.js), bordas tortas, sombras duras hachuradas, marca-texto amarelo e a paleta saturada do MS Paint.
- **Tema claro é o padrão; o escuro é opcional.** A preferência fica salva no banco.
- **O Recharts foi removido.** Os gráficos foram reescritos com Rough.js, o que reduziu o JavaScript de ~690 KB para ~330 KB.
- **Wired Elements e roughViz não foram usados.** São Web Components e uma camada sobre D3, com mais peso e integração pior com React. O mesmo visual foi obtido com o gerador do Rough.js direto nos componentes.
- **A migração 0002 troca as cores das categorias padrão para a paleta Paint.** Só altera as categorias que ainda têm a cor original; cores personalizadas são preservadas.
- **A janela abre em 1280×720** (mínimo de 960×600) e pode ser maximizada para ocupar o monitor inteiro.