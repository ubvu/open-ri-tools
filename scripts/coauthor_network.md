---
jupyter:
  jupytext:
    cell_metadata_filter: -all
    notebook_metadata_filter: kernel
    text_representation:
      extension: .md
      format_name: markdown
      format_version: '1.3'
      jupytext_version: 1.14.7
  kernelspec:
    display_name: Python 3 (ipykernel)
    language: python
    name: python3
---

```python
import panel as pn
pn.extension('tabulator')

import requests
import pandas as pd
#from ipysigma import Sigmaa

from pyalex import Works
```

## Backend


### Find author (autocomplete)

```python
def suggest_authors(name_part):

    url_author_ac = 'https://api.openalex.org/autocomplete/authors'
    params = {'q': name_part}
    
    r = requests.get(url_author_ac, params=params)
    if r.status_code == 200:
        return pd.DataFrame(r.json()['results'])
    else:
        return pd.DataFrame()
```

### Find coauthors / create network

```python
def coauthor_net(author_ids, depth=1, nodes=[], nodes_n=[], edges=[]):
    # depth=2: coauthors of coauthors
    
    works_pages = Works().filter(author={"id": '|'.join(author_ids)}).select(["authorships"]).paginate(per_page=200)

    coauthor_ids = set()
    for works in works_pages:
        for work in works:
            authors = []
            institutes = []
            for authorship in work['authorships']:
                coauthor_ids.add(authorship['author'].get('id'))
                name = authorship['author'].get('display_name')
                if name:
                    authors.append(name)
                    for institute in authorship['institutions']:
                        iname = institute.get('display_name')
                        if iname:
                            institutes.append(iname)
                            edges.append({'n1': name, 'n2': iname, 'type': 'works_at'})

            for n in authors: 
                if n not in nodes_n:
                    nodes.append({'n': n, 'entity': 'author'})  # nodes have to be unique
                    nodes_n.append(n)
            [edges.append({'n1': n1, 'n2': n2, 'type': 'works_with'}) for n1 in authors for n2 in authors if n1 != n2]

            for n in institutes: 
                if n not in nodes_n:
                    nodes.append({'n': n, 'entity': 'institute'})
                    nodes_n.append(n)

    if depth > 1:
        for aid in coauthor_ids:
            coauthor_net(aid, level-1, nodes=nodes, nodes_n=nodes_n, edges=edges)

    return nodes, edges
```

## Components 

```python
autocomplete = pn.widgets.TextInput(placeholder='Start typing')
```

```python
# suggestions table, updated by autocomplete (triggers suggest_authors)
candidates = pn.widgets.Tabulator(pn.bind(suggest_authors, autocomplete.param.value_input),
                                  #layout='fit_columns', 
                                  show_index=False, widths={'hint': '40%'},
                                  disabled=True,  # make non-editable
                                  selectable='toggle',  # user can select fitting candidates
                                  titles={'display_name': 'Name', 'hint': 'Work (most-cited)', 
                                          'works_count': '# Works', 'external_id': 'ID'},
                                  hidden_columns=['id', 'cited_by_count', 'entity_type', 'filter_key'])
```

```python
pn.Column(autocomplete, candidates).servable()
```

```python
# button to trigger co-author search
start_button = pn.widgets.Button(name='Create network', button_type='primary')

coauthors = pn.widgets.Tabulator(pd.DataFrame())

def process_selection(event):
    nodes, edges = coauthor_net(candidates.value.iloc[candidates.selection].id.to_list())
    coauthors.value = pd.DataFrame(nodes)
    
start_button.on_click(process_selection)

pn.Column(start_button, coauthors).servable()
```

```python
# from pelote import edges_table_to_graph, tables_to_graph
```

```python
# g = tables_to_graph(
#     nodes, 
#     edges, 
#     node_col="n", node_data=["entity"], 
#     edge_data=["type"], 
#     edge_source_col="n1",
#     edge_target_col="n2",
#     directed=False
# )

# Sigma(g, node_color='entity', node_size=g.degree)
```
