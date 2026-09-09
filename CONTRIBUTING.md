# Contributing Guide

Thank you for your interest in contributing to the **IC XSD to RDF Transformer** project! We welcome contributions of all kinds — code, documentation, suggestions, and issue reports.

---

## Ways to Contribute

### 🛠️ Code Contributions

- Fix bugs
- Improve transformation logic or RDF output
- Add support for new XSD constructs
- Improve performance or modularity

### 📝 Documentation

- Improve clarity of README, USAGE, or code comments
- Add example use cases or output samples

### 🐞 Report Issues

- Describe problems encountered with specific `.xsd` files
- Suggest enhancements or usability improvements

---

## Getting Started

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/ewrayjohnson/ism2rdf.git
   cd ism2rdf
   ```
3. **Create a branch**
   ```bash
   git checkout -b feature/my-new-feature
   ```
4. **Make your changes**
5. **Test your changes locally**
6. **Commit with clear messages**
7. **Push to your fork**
   ```bash
   git push origin feature/my-new-feature
   ```
8. **Open a Pull Request (PR)** on the main repo

---

## Coding Guidelines

- Follow the existing code style
- Use ES6+ features, with top-level `async/await` for all asynchronous logic
- Keep commits focused and descriptive
- Avoid introducing unused dependencies
- Keep namespace derivation generic; do not hardcode vocabulary-specific prefix mappings.
- Preserve local names and literal values. Document RDF identity changes in [MIGRATION.md](MIGRATION.md) and [CHANGELOG.md](CHANGELOG.md).

## Testing Guidelines

- Follow [USAGE.md](USAGE.md) to stage sources, build, and run the transformer.
- Run `node --test test/uri-mapping.test.mjs test/uri-output.test.mjs` after generation.
- Validate JSON-LD, Turtle, N-Triples, TriG and TDF, including graph identifiers, payload hashes and URI consistency.
- Run `npm run lint`; the current checkout lacks an ESLint configuration, so report that limitation rather than claiming lint passes.
- Review source overlays before committing because staged payloads include tracked files. Keep generated `out/` and `dist/` artifacts out of commits.

---

## Communication

- Open an issue for major changes or new features before starting work
- Respect contributor time: be clear, constructive, and concise
- Be kind and inclusive — we value a welcoming community!

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

We appreciate your contributions — thank you!

