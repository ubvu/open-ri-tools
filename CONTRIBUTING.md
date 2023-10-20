Would you like to contribute to the project as a developer? Great! Follow this guide to get started.

## Prerequisites

For setup, basic shell knowledge is required. In order to add your apps or features to this github repository, you need to understand the basics of git as well as [forks and pull requests](https://docs.github.com/en/get-started/quickstart/contributing-to-projects)
For development itself, some Python knowledge is required; if you are not familiar with Jupyter notebooks, the Coderefinery provides a good [introduction](https://coderefinery.github.io/jupyter/).
Since we are using [Panel](https://panel.holoviz.org/), knowledge of web frameworks is not essential.

## Setup

### Local environment

If you have been added as a contributor, clone this repository:
```bash
git clone git@github.com:ubvu/open-ri-tools.git
cd open-ri-tools
```

If not, fork the repository first, then clone your fork:
```bash
git clone git@github.com:{your_username}/open-ri-tools.git
cd open-ri-tools
```

We recommend installing [conda](https://docs.conda.io/en/latest/miniconda.html) to manage all necessary packages.\
You can then create a new package environment from the file *environment.yml*

Install and activate the environment:
```bash
conda env create --file environment.yml
conda activate ori
```
After use, deactivate the environment:
```bash
conda deactivate ori
```

### Creating the notebooks

All source code is written inside a Jupyter notebook which has two benefits:
- code is enriched with markdown formatted text for better readability
- notebooks make it very easy and quick to test new features

A disadvantage of notebooks is that their rich metadata can make version control troublesome.
For that reason, we use Jupytext which removes metadata from notebooks and stores them as .md files
- /scripts contains those .md files (when opened on github, they are rendered quite nicely)
- use the following command to create all notebooks from .md files at once (they appear under /notebooks):
```bash
jupytext --sync scripts/*
```
- the notebooks can be run and modified and when saved, the .md file under /scripts is modified (and metadata stripped)
- the notebooks themselves are gitignored

## Develop

**Make sure to work on a new branch and submit your changes later as part of a pull request.**

### JupyterLab

JupyterLab is a sort of integrated development environment (IDE) for notebooks. It is installed into the *ori* environment and we use it to develop and test our apps.
Read more about it [here](https://coderefinery.github.io/jupyter/interface/).

If you haven't yet done so, activate the package environment.
Then start up JupyterLab (opens automatically in browser):
```bash
conda activate ori
jupyter lab
```

Start developing! Consult the Panel [guides and examples](https://panel.holoviz.org/how_to/notebook/index.html).\
**Make sure to add `.servable()` to a template or panel so that it is rendered.**

### Testing the application

There are multiple ways to run and test your application while developing.

1. Using [Panel Preview](https://panel.holoviz.org/how_to/notebook/jupyterlabpreview.html) in JupyterLab; note that some javascript behaviour doesn't work in preview, however.

2. Launching the app(s) locally from the [command line](https://panel.holoviz.org/how_to/server/commandline.html):\
`panel serve notebooks/*.ipynb`

3. Convert app(s) to static HTML

Similar to the project website which is built on github using *actions*, you can build the website locally for testing.
Follow the [instructions](https://panel.holoviz.org/how_to/wasm/convert.html) or use the bash script provided in this repo:
```bash
bash convert.sh
```

The script executes this command:
```bash
panel convert notebooks/*.ipynb --to pyodide-worker --out docs --index --watch
```
**-> converts all notebooks and places the files under _docs_** \
--index: creates an index for better navigation \
--watch: convert whenever changes in notebooks/ are detected

For testing, the page can be served locally by launching a http server:
```bash
python -m http.server
```

## Publish

To add your local commits to the github repository, create a [pull request](https://docs.github.com/en/get-started/quickstart/contributing-to-projects).
Once the pull request has been accepted, the website is re-built automatically, incorporating any new applications or changes.

