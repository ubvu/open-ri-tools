[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

# Open RI tools: discover the impact of your research

*Open RI (Research Intelligence) tools are web-applications for researchers that can help with questions regarding research metadata, such as "is my research cited in clinical trials?".*

Commercial applications offer these insights as well, but they are usually closed systems, contradicting the premise of open science.
We use open databases such as [OpenAlex](https://openalex.org/) to offer an alternative platform, involving researchers in the development process. Check out our [contribution guide](#contribute).

## Try it out yourself!

All applications are created with [Panel](https://panel.holoviz.org/) and other tools within the [HoloViz](https://holoviz.org/) ecosystem.

There are two ways to run the applications in your browser
- as static [websites](https://ubvu.github.io/open-ri-tools/); this deployment uses [Pyodide](https://pyodide.org/en/stable/)
- as a web application running on mybinder:

[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/ubvu/open-ri-tools/mybinder?urlpath=/panel/)

For the static websites, we use a technology called Progressive Web Apps which allows you to install each application on your computer, e.g. follow the instructions for [Chrome](https://support.google.com/chrome/answer/9658361).

## Contribute

### Ideas and suggestions

Whether you are a researcher with ideas for new tools or a developer with improvement suggestions, please let us know by creating an [issue](https://github.com/ubvu/open-ri-tools/issues).

### Development workflow

If you would like to help with the development, awesome, this is our workflow.
We aim to make the development of new apps/features as easy as possible so that we can focus more on content.

#### Setup

##### Local development environment

(Basic Shell knowledge required)

First, clone this repository:
```bash
git clone git@github.com:ubvu/open-ri-tools.git
cd open-ri-tools
```

I recommend using conda to install all necessary packages:
https://docs.conda.io/en/latest/miniconda.html

We can then create a new environment from *environment.yml*

Install and activate the environment:
```bash
conda env create --file environment.yml
conda activate ori
```
after use
```bash
conda deactivate ori
```

##### Creating the notebooks

All source code is written inside a Jupyter notebook which has two benefits:
- code is enriched with markdown formatted text for better readability
- notebooks make it very easy and quick to test new features

A disadvantage of notebooks is that their rich metadata can make version control troublesome.
For that reason, we use **Jupytext** which removes metadata from notebooks and stores them as .md files
- /scripts contains those .md files (when opened on github, they are rendered quite nicely)
- use the following command to create all notebooks from .md files at once (they appear under /notebooks):
```bash
jupytext --sync scripts/*
```
- the notebooks can be run and modified and when saved, the .md file under /scripts is modified (and metadata stripped)
- the notebooks themselves are gitignored

#### Development in Jupyterlab

To start up jupyterlab (opens automatically in browser):
```bash
jupyter lab
```

Start developing: [instructions](https://panel.holoviz.org/how_to/notebook/index.html)

I recommend using Panel Preview (note: some js behaviour doesn't work in preview).\
Make sure to add `.servable()` to a template or panel so that it is rendered.

#### Convert application to static HTML

The website itself is built on github using **actions**.
To build the website locally for testing, follow the [instructions](https://panel.holoviz.org/how_to/wasm/convert.html) or use the bash script provided in this repo:
```bash
panel convert notebooks/*.ipynb --to pyodide-worker --out docs --index --watch
```
**This converts all notebooks and places the files under _docs_** \
--index: creates an index for better navigation \
--watch: convert whenever changes in notebooks/ are detected

For testing, the page can be served locally:
`python -m http.server`


