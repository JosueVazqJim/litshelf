import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import pg from "pg";

const db = new pg.Client({
	user: "USER",
	password: "PASSWORD",
	database: "DATABASE",
	host: "HOST",
	port: PORT,
});

try {
	db.connect();
} catch (error) {
	console.log("Error connecting to the database: ", error);
}

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 150 // límite de 100 solicitudes por IP cada 15 minutos
});

const app = express();
const port = 3000;

// Aplica el limitador en la ruta raíz "/"
app.use("/", apiLimiter);
const API_URL = "https://openlibrary.org";
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan("combined")); // Log requests to the console
app.use(express.static("public")); // Use the public folder for static files.

async function getTop5Books() {
	try {
		const query = `
			SELECT b.id, b.title, 
               STRING_AGG(DISTINCT a.name, ', ') AS autor, 
			   String_AGG(DISTINCT s.subject, ', ') as subject,
               b.description, b.id_cover, b.first_publish_year,
               COALESCE(AVG(r.rating), 0) AS average_rating
        FROM books b
        LEFT JOIN reviews r ON b.id = r.id_books
        LEFT JOIN books_autores ba ON b.id = ba.id_book
        LEFT JOIN autores a ON ba.id_autor = a.id
		LEFT JOIN books_subjects bs ON b.id = bs.id_book
		LEFT JOIN subjects s ON bs.id_subject = s.id
        GROUP BY b.id, b.title, b.description, b.id_cover
        ORDER BY average_rating DESC
        LIMIT 5;
		`;
		const result = await db.query(query);
		const topBooks = result.rows;
		return topBooks;
	} catch (error) {
		console.error("Error fetching top-rated books:", error);
		throw error; // Re-throw the error to propagate it upwards
	}
}

async function getClassicsBooks() {
	//obtener los libros clasicos, subject classic
	try {
		const query = `
			SELECT b.id, b.title, 
			   STRING_AGG(DISTINCT a.name, ', ') AS autor, 
			   String_AGG(DISTINCT s.subject, ', ') as subject,
			   b.description, b.id_cover, b.first_publish_year,
			   COALESCE(AVG(r.rating), 0) AS average_rating
		FROM books b
		LEFT JOIN reviews r ON b.id = r.id_books
		LEFT JOIN books_autores ba ON b.id = ba.id_book
		LEFT JOIN autores a ON ba.id_autor = a.id
		LEFT JOIN books_subjects bs ON b.id = bs.id_book
		LEFT JOIN subjects s ON bs.id_subject = s.id
		WHERE s.subject = 'classic'
		GROUP BY b.id, b.title, b.description, b.id_cover
		ORDER BY average_rating DESC
		LIMIT 5;
		`;
		const result = await db.query(query);
		const topBooks = result.rows;
		return topBooks;
	} catch (error) {
		console.error("Error fetching top-rated books:", error);
		throw error; // Re-throw the error to propagate it upwards
	}
}

async function getBooks(name) {
	console.log("Searching books in DB");
	try {
		const query = `
		SELECT b.id, 
		b.title, 
		STRING_AGG(DISTINCT a.name, ', ') AS autor, 
		STRING_AGG(DISTINCT s.subject, ', ') AS subject,
		b.description, 
		b.id_cover, 
		COALESCE(AVG(r.rating), 0) AS average_rating
		FROM books b
		LEFT JOIN reviews r ON b.id = r.id_books
		LEFT JOIN books_autores ba ON b.id = ba.id_book
		LEFT JOIN autores a ON ba.id_autor = a.id
		LEFT JOIN books_subjects bs ON b.id = bs.id_book
		LEFT JOIN subjects s ON bs.id_subject = s.id
    	WHERE b.title ILIKE $1
		GROUP BY b.id, b.title, b.description, b.id_cover
		ORDER BY average_rating DESC;
		`;

		const result = await db.query(query, [`%${name}%`]);
		const book = result.rows;
		return book;
	} catch (error) {
		console.error("Error fetching book:", error);
		throw error;
	}
}

async function getAutoresByBook(id) {
	try {
		const query = `
		SELECT a.name
		FROM autores a
		INNER JOIN books_autores ba ON a.id = ba.id_autor
		WHERE ba.id_book = $1
		`;
		const result = await db.query(query, id);
		let autores = result.rows;
		autores = tratamientoAutoresBook(autores);
		return autores;
	}
	catch (error) {
		throw error;
	}
};

async function getReviewsByBook(id) {
	try {
		const query = `
		SELECT id, reviewer_name, review_content, rating
		FROM reviews
		WHERE id_books = $1
		`;
		const result = await db.query(query, id);
		let reviews = result.rows;
		return reviews;
	} catch (error) {
		throw error;
	}
}

async function insertBooksIntoDB(books) {
	try {
		books.forEach(async (book) => {
			const query = `
				INSERT INTO books (id, title, description, id_cover, first_publish_year)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (id) DO NOTHING;
			`;
			const values = [book.id, book.title, book.description, book.id_cover, book.first_publish_year];
			await db.query(query, values);
		})
	} catch (error) {
		throw error;
	}
}

async function insertAutoresIntoDB(autores) {
	try {
		autores.forEach(async (autor) => {
			const query = `
				INSERT INTO autores (id, name)
				VALUES ($1, $2)
				ON CONFLICT (id) DO NOTHING;
			`;
			const values = [autor.id, autor.name];
			await db.query(query, values);
		})
	} catch (error) {
		throw error;
	}
}

async function insertSubjectsAndGetIds(subjects) {
	const subjectIds = [];
	for (const subject of subjects) {
		const query = `
            INSERT INTO subjects (subject)
            VALUES ($1)
            ON CONFLICT (subject) DO NOTHING
            RETURNING id;
        `;
		const values = [subject];
		const result = await db.query(query, values);
		if (result.rows.length > 0) {
			subjectIds.push(result.rows[0].id);
		} else {
			// If the subject already exists, retrieve its ID
			const selectQuery = `SELECT id FROM subjects WHERE subject = $1`;
			const selectResult = await db.query(selectQuery, values);
			subjectIds.push(selectResult.rows[0].id);
		}
	}
	return subjectIds;
}

//relacionar los autores con los libros
async function insertBooksAutoresIntoDB(entrada) {
	try {
		const query = `
			INSERT INTO books_autores (id_book, id_autor)
			VALUES ($1, $2)
			ON CONFLICT (id_book, id_autor) DO NOTHING;
		`;
		const values = [entrada.id_book, entrada.id_autor];
		await db.query(query, values);
	} catch (error) {
		throw error;
	}
}

async function insertBooksSubjectsIntoDB(entrada) {
	try {
		const query = `
			INSERT INTO books_subjects (id_book, id_subject)
			VALUES ($1, $2)
			ON CONFLICT (id_book, id_subject) DO NOTHING;
		`;
		const values = [entrada.id_book, entrada.id_subject];
		await db.query(query, values);
	} catch (error) {
		throw error;
	}
}

//metodo para buscar libros en la api de openlibrary
async function searchBooksOpenLibrary(title) {
	console.log("Searching books in OpenLibrary API");
	try {
		const librosData = await axios.get(
			API_URL + "/search.json?q=" + title + "&mode=everything&limit=5"
		);

		let librosBuscados = await Promise.all(
			librosData.data.docs.map(async (libro) => {
				const work = await axios.get(API_URL + libro.key + ".json");
				return {
					id: libro.key,
					title: libro.title || "No title available",
					author_id: libro.author_key || "No author key available",
					autor: libro.author_name || "Unknown Author",
					id_cover: libro.cover_i || "No Cover Available",
					description: (work.data.description && work.data.description.value) || work.data.description || "No description available",
					first_publish_year: libro.first_publish_year || "Year Not Available",
					subjects: work.data.subjects || "No subjects available",
				};
			})
		);
		return librosBuscados;
	} catch (error) {
		console.log(error);
		throw error;
	}
}

function tratamientoIdBook(idBook) {
	return idBook.replace("/works/", "");
}

function tratamientoAutoresBook(autores) {
	// recibimos un [] de autores y devolvemos los nombres en una cadena
	if (!autores) {
		return "Unknown Author";
	}
	let nombres = "";
	autores.forEach((autor) => {
		nombres += autor + ", ";
	});
	return nombres.slice(0, -2); // Remove the trailing comma and space
}

function tratamientoSubjectsBook(subjects) {
	// recibimos un [] de subjects y devolvemos los nombres en una cadena
	if (!subjects) {
		return "No subjects available";
	}
	//comprobamos si es un string o un array
	if (typeof subjects === "string") {
		return subjects;
	}

	let nombres = "";
	subjects.forEach((subject) => {
		nombres += subject + ", ";
	});
	return nombres.slice(0, -2); // Remove the trailing comma and space
}

function extraerIdAutoresNombres(ids, names) {
	//hay que vicular los ids con los nombres
	let autores = [];
	for (let i = 0; i < ids.length; i++) {
		autores.push({
			id: ids[i],
			name: names[i]
		});
	}
	return autores;
}

function extraerSubjects(names) {
	///solo extraemos los subjects y los ponemos en un array
	let subjects = [];

	if (typeof names === "string") {
		subjects.push(names);
		return subjects
	}

	for (let i = 0; i < names.length; i++) {
		subjects.push(names[i]);
	}
	return subjects;
}

app.get("/", async (req, res) => {
	try {
		let topBooks = await getTop5Books();
		console.log(topBooks);
		res.status(200).render("index.ejs", { content: topBooks, activeNav: "home", error: null });
		//res.status(200).send(topBooks);
	} catch (error) {
		console.log(error);
		res.status(400).render("index.ejs", {
			content: [], // Envía un array vacío para los libros
			type: "book",
			activeNav: "home",
			error: {
				title: "Error",
				description: error.message,
			},
		});
	}
});

//endpoint para cuando se hace una busqueda y se selecciona que sean libros
app.post("/searchBooks", async (req, res) => {
	try {
		const libroBuscar = req.body.title; // obtener el libro a buscar
		console.log(libroBuscar);
		let librosBuscados = await getBooks(libroBuscar);

		if (librosBuscados.length === 0) {
			console.log("No books found in the DB, searching in OpenLibrary API");
			librosBuscados = await searchBooksOpenLibrary(libroBuscar);

			//extraemos autores y libros
			let autoresBooks = librosBuscados.map((libro) => {
				return {
					id_book: tratamientoIdBook(libro.id),
					autores: extraerIdAutoresNombres(libro.author_id, libro.autor),
				}
			});

			//extraemos subjects y libros
			let subjectsBooks = librosBuscados.map((libro) => {
				return {
					id_book: tratamientoIdBook(libro.id),
					subjects: extraerSubjects(libro.subjects),
				}
			});

			//limpiamos cada libro para insertar en la db
			let resLibros = librosBuscados.map((libro) => {
				let year = libro.first_publish_year;
				if (year === "Year Not Available") {
					year = null;
				}
				return {
					id: tratamientoIdBook(libro.id),
					title: libro.title,
					id_cover: libro.id_cover,
					description: libro.description,
					first_publish_year: year,
				};
			});

			//insertamos los libros en la db
			console.log("Inserting books into the DB");
			await insertBooksIntoDB(resLibros);

			let autores = autoresBooks.map((autor) => {
				return autor.autores;
			});

			autores = autores.flat();
			await insertAutoresIntoDB(autores);

			//preparamos libros a mostrar
			librosBuscados = librosBuscados.map((libro) => {
				return {
					id: tratamientoIdBook(libro.id),
					title: libro.title,
					autor: tratamientoAutoresBook(libro.autor),
					id_cover: libro.id_cover,
					description: libro.description,
					first_publish_year: libro.first_publish_year,
					subjects: tratamientoSubjectsBook(libro.subjects),
				};
			});


			autoresBooks.forEach(async (entrada) => {
				entrada.autores.forEach(async (autor) => {
					await insertBooksAutoresIntoDB({
						id_book: entrada.id_book,
						id_autor: autor.id,
					});
				});
			});

			//ingresamos los subjects a la tabla subjects
			subjectsBooks.forEach(async (subject) => {
				const subjectIds = await insertSubjectsAndGetIds(subject.subjects);
				subjectIds.forEach(async (id) => {
					await insertBooksSubjectsIntoDB({
						id_book: subject.id_book,
						id_subject: id,
					});
				});
			})

			console.log(subjectsBooks);
		}

		res.status(200).render("index.ejs", { content: librosBuscados, activeNav: "home", error: null });
		//res.status(200).send(librosBuscados);
	} catch (error) {
		console.log(error);
		res.status(200).render("index.ejs", {
			content: [], // Envía un array vacío para los libros
			type: "book",
			activeNav: "home",
			error: {
				title: "Error",
				description: error.message,
			},
		});
	}
});

app.get("/viewBook", async (req, res) => {
	try {
		const id = req.query.id;
		console.log(typeof id);
		const query = `
        SELECT b.id, b.title, 
        STRING_AGG(DISTINCT a.name, ', ') AS autor, 
        STRING_AGG(DISTINCT s.subject, ', ') AS subject,
        b.description, b.id_cover, b.first_publish_year,
        COALESCE(AVG(r.rating), 0) AS ratings_average
        FROM books b
        LEFT JOIN reviews r ON b.id = r.id_books
        LEFT JOIN books_autores ba ON b.id = ba.id_book
        LEFT JOIN autores a ON ba.id_autor = a.id
        LEFT JOIN books_subjects bs ON b.id = bs.id_book
        LEFT JOIN subjects s ON bs.id_subject = s.id
        WHERE b.id = $1
        GROUP BY b.id, b.title, b.description, b.id_cover
        `;
		const result = await db.query(query, [id]); // Wrap id in an array
		const book = result.rows[0];
		const reviews = await getReviewsByBook([id]);
		book.reviews = reviews;
		console.log(reviews);
		res.status(200).render("viewBook.ejs", { content: book, activeNav: "home", error: null });
	} catch (error) {
		console.log(error);
		res.status(200).render("viewBook.ejs", {
			book: {}, // Envía un objeto vacío para el libro
			activeNav: "home",
			error: {
				title: "Error",
				description: error.message,
			},
		});
	}
});

app.post("/postReview", async (req, res) => {
	try {
		const id_books = req.body.bookId;
		const rating = req.body.rating;
		const review_content = req.body.reviewText;
		const reviewer_name = req.body.userName;
		const query = `
		INSERT INTO reviews (reviewer_name, review_content, rating, id_books)
		VALUES ($1, $2, $3, $4)
		RETURNING id;
		`;
		const values = [reviewer_name, review_content, rating, id_books];
		const result = await db.query(query, values);
		const reviewId = result.rows[0].id;
		res.status(200).redirect("/viewBook?id=" + id_books);
	} catch (error) {
		console.log(error);
		res.status(400).send({ error: error.message });
	}
});

app.get("/trend", async (req, res) => {
	try {
		let topBooks = await getTop5Books();
		console.log(topBooks);
		res.status(200).render("index.ejs", { content: topBooks, activeNav: "trend", error: null });
		//res.status(200).send(topBooks);
	} catch (error) {
		console.log(error);
		res.status(400).render("index.ejs", {
			content: [], // Envía un array vacío para los libros
			type: "book",
			activeNav: "home",
			error: {
				title: "Error",
				description: error.message,
			},
		});
	}
});

app.get("/classics", async (req, res) => {
	try {
		let topBooks = await getTop5Books();
		console.log(topBooks);
		res.status(200).render("index.ejs", { content: topBooks, activeNav: "classics", error: null });
		//res.status(200).send(topBooks);
	} catch (error) {
		console.log(error);
		res.status(400).render("index.ejs", {
			content: [], // Envía un array vacío para los libros
			type: "book",
			activeNav: "home",
			error: {
				title: "Error",
				description: error.message,
			},
		});
	}
});

app.listen(port, () => {
	console.log("Server running on port " + port);
});
