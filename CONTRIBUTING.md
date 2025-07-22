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
   git clone https://github.com/ewrayjohnson/ic-xsd-to-rdf.git
   cd ic-xsd-to-rdf
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

## Testing Guidelines

- Run the transformer against multiple `.xsd` files
- Validate output formats (Turtle, JSON-LD, N-Triples)
- Check RDF validity using tools like [rdf-validate](https://www.npmjs.com/package/rdf-validate)

---

## Communication

- Open an issue for major changes or new features before starting work
- Respect contributor time: be clear, constructive, and concise
- Be kind and inclusive — we value a welcoming community!

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).

We appreciate your contributions — thank you!

