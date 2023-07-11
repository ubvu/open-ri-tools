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

All source code is written in a Jupyter notebook which makes it very easy and quick to test new features.
A disadvantage of notebooks is that their rich metadata can make version control troublesome.
For that reason, we use Jupytext which removes metadata from notebooks and stores them as .py files


- /scripts contains plain text notebooks (metadata has been removed)
- when opened as a notebook (in JupyterLab), Jupytext creates an .ipynb file under /notebooks
- this notebook can be run and modified and when saved, the plain text notebook under /scripts is modified (and metadata stripped)
- the notebooks themselves are gitignored

Use the following command to create all notebooks from scripts at once:
```
jupytext --sync scripts/*
```

### Development in Jupyterlab

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


