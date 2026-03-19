# EasyLang

EasyLang is a beginner-friendly programming language that reads like plain English and runs directly in the browser.

## Features

- Simple, human-readable syntax
- Browser-based code editor
- Built-in interpreter pipeline (lexer, parser, interpreter)
- Static website and Node.js server for local hosting

## Project Structure

- `index.html` - landing page
- `editor.html` - in-browser EasyLang editor
- `docs.html` - language documentation
- `examples.html` - sample programs
- `style.css` - shared styles
- `editor.js` - editor UI logic
- `main.js` - homepage behavior
- `server.js` - Node.js static file server
- `lang/lexer.js` - tokenizer
- `lang/parser.js` - parser
- `lang/interpreter.js` - runtime evaluator

## Run Locally

### Requirements

- Node.js 18+

### Start

```bash
npm start
```

Open:

- http://localhost:8080

## Deploy (Cloud Run)

This project is containerized with a `Dockerfile` and deploys to Cloud Run.

Live service URL:

- https://easylang-jlqeawdgdq-uc.a.run.app

## License

MIT
