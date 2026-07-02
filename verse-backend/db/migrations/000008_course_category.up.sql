ALTER TABLE courses ADD COLUMN category TEXT NOT NULL DEFAULT 'topic';

UPDATE courses SET category = 'warmup' WHERE slug = 'warmup';
UPDATE courses SET category = 'messiah' WHERE slug = 'messiah-prophecy';
