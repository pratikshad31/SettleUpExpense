// backend/server.js
// Only job: load env variables and start listening.

require("dotenv").config(); // must run before anything reads process.env

const app = require("./app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});