-- WCKD v2 — cores das categorias padrão na paleta saturada estilo MS Paint.
-- Só altera categorias que ainda estão com a cor original da v1 (personalizações são preservadas).

UPDATE categories SET color = CASE name || '|' || kind || '|' || color
    WHEN 'Alimentação|expense|#F59E0B'   THEN '#FF8040'
    WHEN 'Transporte|expense|#3B82F6'    THEN '#0000FF'
    WHEN 'Moradia|expense|#8B5CF6'       THEN '#800080'
    WHEN 'Saúde|expense|#EF4444'         THEN '#FF0080'
    WHEN 'Educação|expense|#06B6D4'      THEN '#008080'
    WHEN 'Tecnologia|expense|#6366F1'    THEN '#8000FF'
    WHEN 'Lazer|expense|#EC4899'         THEN '#FF00FF'
    WHEN 'Assinaturas|expense|#14B8A6'   THEN '#0080FF'
    WHEN 'Compras|expense|#F97316'       THEN '#804000'
    WHEN 'Vestuário|expense|#A855F7'     THEN '#808000'
    WHEN 'Contas|expense|#EAB308'        THEN '#FFC800'
    WHEN 'Outros|expense|#71717A'        THEN '#808080'
    WHEN 'Salário|income|#22C55E'        THEN '#00C800'
    WHEN 'Freelance|income|#10B981'      THEN '#008000'
    WHEN 'Monetização|income|#84CC16'    THEN '#80C000'
    WHEN 'Afiliados|income|#2DD4BF'      THEN '#00C080'
    WHEN 'Investimentos|income|#0EA5E9'  THEN '#004080'
    WHEN 'Outros|income|#71717A'         THEN '#808080'
    ELSE color END;
