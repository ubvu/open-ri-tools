## Why is this folder empty?

Notebooks are only used locally for development.

We use [Jupytext](https://jupytext.readthedocs.io/en/latest/) to sync notebooks with metadata-free .md files (under *scripts*).

After cloning the repository and setting up the environment, run this command to create the notebooks from .md files:
```bash
jupytext --sync scripts/*
```
