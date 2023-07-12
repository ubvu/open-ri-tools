# Open RI tools: discover the impact of your research

All apps are created with [Panel](https://panel.holoviz.org/).\
They are static websites running entirely in your browser by leveraging [Pyodide](https://pyodide.org/en/stable/).

## Contribution / Development workflow

A central idea of this project is to make development easy, allowing to quickly add new apps and features.

### Setup

#### Environment

I recommend using conda to install all necessary packages:
https://docs.conda.io/en/latest/miniconda.html

We can create a new environment from the file environment.yml

Install and activate the environment:
```
conda env create --file environment.yml
conda activate panel
```
after use
```
conda deactivate panel
```

#### Notebooks

All source code is written inside a Jupyter notebook which has two benefits:
- code is enriched with markdown formatted text for better readability
- notebooks make it very easy and quick to test new features

A disadvantage of notebooks is that their rich metadata can make version control troublesome.
For that reason, we use **Jupytext** which removes metadata from notebooks and stores them as .md files
- /scripts contains those .md files (when opened on github, they are rendered quite nicely)
- use the following command to create all notebooks from .md files at once (they appear under /notebooks):
```
jupytext --sync scripts/*
```
- the notebooks can be run and modified and when saved, the .md file under /scripts is modified (and metadata stripped)
- the notebooks themselves are gitignored

### Development in Jupyterlab

I recommend using Panel Preview (note: some js behaviour doesn't work in preview).\
Make sure to add `.servable()` to a template or panel so that it is rendered.

### Convert application to static HTML

The website itself is built on github using **actions**.
To build the website locally for testing, follow these steps:

[Instructions](https://panel.holoviz.org/how_to/wasm/convert.html)

(you can use the bash script provided in this repo)
```bash
panel convert notebooks/*.ipynb --to pyodide-worker --out docs --index --watch
```
**Converts all notebooks and places the files under _docs_**\
--index: creates an index for better navigation\
--watch: convert whenever changes in notebooks/ are detected

For testing, the page can be served locally:
`python -m http.server`


