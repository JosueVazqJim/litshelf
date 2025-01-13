//just define the queries here

const getTop5Books = `SELECT b.id, b.title, b.description, b.id_cover, 
					COALESCE(AVG(r.rating), 0) AS average_rating
			FROM books b
			LEFT JOIN reviews r ON b.id = r.id_books
			GROUP BY b.id, b.title, b.description, b.id_cover
			ORDER BY average_rating DESC
			LIMIT 5;`;