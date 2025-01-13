-- Tabla de autores
CREATE TABLE autores (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- Tabla de libros
CREATE TABLE books (
    id VARCHAR(255) PRIMARY KEY not null,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    id_cover VARCHAR(255),
	first_publish_year int
);

-- Tabla de temas
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(255) NOT NULL
);

-- Tabla intermedia entre libros y autores (relación muchos a muchos)
CREATE TABLE books_autores (
    id SERIAL PRIMARY KEY,
    id_book VARCHAR(255) NOT NULL,
    id_autor VARCHAR(255) NOT NULL,
    FOREIGN KEY (id_book) REFERENCES books (id) ON DELETE CASCADE,
    FOREIGN KEY (id_autor) REFERENCES autores (id) ON DELETE CASCADE
);

-- Tabla intermedia entre libros y temas (relación muchos a muchos)
CREATE TABLE books_subjects (
    id SERIAL PRIMARY KEY,
    id_book VARCHAR(255) NOT NULL,
    id_subject INTEGER NOT NULL,
    FOREIGN KEY (id_book) REFERENCES books (id) ON DELETE CASCADE,
    FOREIGN KEY (id_subject) REFERENCES subjects (id) ON DELETE CASCADE
);

-- Tabla de reseñas
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    id_books VARCHAR(255) NOT NULL,
    reviewer_name VARCHAR(255) NOT NULL,
    review_content TEXT,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    FOREIGN KEY (id_books) REFERENCES books (id) ON DELETE CASCADE
);

ALTER TABLE books_autores
ADD CONSTRAINT unique_books_autores UNIQUE (id_book, id_autor);

ALTER TABLE books_subjects
ADD CONSTRAINT unique_books_subjects UNIQUE ();

ALTER TABLE subjects
ADD CONSTRAINT unique_constraint_subject UNIQUE (subject);

select * from autores
select * from books
select * from subjects
select * from reviews
select * from books_autores
select * from books_subjects

