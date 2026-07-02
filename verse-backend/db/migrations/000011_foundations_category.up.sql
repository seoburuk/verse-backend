-- '기초'(Foundations, 5구절)를 나머지 30개 주제 코스(topic, 175구절)와 분리해
-- 별도 섹터로 노출한다. warmup/messiah와 동일하게 코스 하나짜리 카테고리.
UPDATE courses SET category = 'foundations' WHERE slug = 'beginnings';
