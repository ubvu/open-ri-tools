# Open RI tools: discover the impact of your research

All apps are created with [Panel](https://panel.holoviz.org/).\
They are static websites running entirely in your browser by leveraging [Pyodide](https://pyodide.org/en/stable/).

## Contribution / Development workflow

A central idea of this project is to make development easy, allowing to quickly add new apps and features.

### Development in Jupyterlab

All source code is written in a Jupyter notebook which makes it very easy and quick to test new features.

I recommend using Panel Preview (note: some js behaviour doesn't work in preview).\
Make sure to add `.servable()` to a template or panel so that it is rendered.

### Convert application to static HTML (hosted on gh pages)

[Instructions](https://panel.holoviz.org/how_to/wasm/convert.html)

(you can use the bash script provided in this repo)
```bash
panel convert notebooks/* --to pyodide-worker --out docs --index --watch
```
**Converts all notebooks and places the files under _docs_**\
--index: creates an index for better navigation\
--watch: convert whenever changes in notebooks/ are detected

For testing, the page can be served locally:
`python -m http.server`


