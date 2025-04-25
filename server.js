require('dotenv').config(); // Load environment variables

const express = require('express');
const app = express();

// ...existing code...

const PORT = process.env.PORT || 3000;
if (!process.env.PORT) {
  console.warn('Warning: PORT not set in .env file, using default 3000');
}

// Example: If you use a DB connection string
// const dbUrl = process.env.DB_URL;
// if (!dbUrl) {
//   throw new Error('DB_URL not set in .env file');
// }

// ...existing code...

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ...existing code...