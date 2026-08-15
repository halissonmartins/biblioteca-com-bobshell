-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "authors_name_trgm_idx" ON "authors" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "books_title_trgm_idx" ON "books" USING GIN ("title" gin_trgm_ops);
