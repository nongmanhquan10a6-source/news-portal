# Project Guidelines

## Architecture

- `src/app.js` is the Express entry point. It loads environment variables, serves `public/`, mounts the article API routes, connects to MongoDB, then starts the HTTP listener.
- `src/config/db.js` owns the Mongoose connection and reads `MONGO_URI`; `PORT` is optional and defaults to `3000`.
- `src/models/Article.js` defines the MongoDB article document, including draft/published status and publication timestamps.
- `public/` contains static site assets served by Express. Keep browser-facing assets there rather than mixing them into the API entry point.
- The article API uses `/api/articles`: POST creates an article, GET lists published articles sorted newest first, and GET `/api/articles/:slug` returns one published article. Keep published-only filtering consistent between list and detail reads.

## Build, Test, and Lint

- `npm start` starts the server with Node.
- `npm run dev` starts it with Nodemon for reloads during development.
- `package.json` does not define build, test, or lint scripts, and no project test runner is configured; there is currently no command for running a single test.

## Conventions

- Server-side JavaScript uses CommonJS (`require` and `module.exports`).
- Article persistence and queries go through the Mongoose `Article` model; preserve its schema defaults, required fields, and `draft`/`published` enum when changing article behavior.
- API responses use JSON. Success responses wrap payloads in `data` and use `success`; list responses also include `count`. Keep this shape consistent when adding endpoints.
- Load secrets and deployment-specific settings from environment variables; `.env` is ignored by Git.
