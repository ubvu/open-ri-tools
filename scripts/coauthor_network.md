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

import requests
import pandas as pd

from pyalex import Works
import hvplot.networkx as hvnx
import networkx as nx

pn.extension('tabulator', 'plotly')
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
def coauthor_net(author_ids, author_names, depth=1, edges=[], labels={}):
    '''
    author_ids: for search, only the first is used as node id
    depth=2: coauthors of coauthors
    # TODO: when depth=2, we might create nodes for aids that were not assigned a node before (depth=1)
    # e.g. when authorX has two ids under the same name
    '''
    
    # add name for self
    # for recursive calls: we've already added it 
    if author_ids[0] not in labels:
        labels[author_ids[0]] = author_names[0]
    
    works_pages = Works().filter(author={"id": '|'.join(author_ids)}).select(["authorships"]).paginate(per_page=200)

    coauthor_ids = set()  # for recursive calls
    for works in works_pages:
        for work in works:
            for authorship in work['authorships']:
                aid = authorship['author'].get('id')
                if aid not in author_ids:  # no need to add self
                    coauthor_ids.add(aid)
                    name = authorship['author'].get('display_name')
                    if name:  # without a name, don't include in network
                        edges.append({'n1': author_ids[0], 'n2': aid, 'type': 'works_with'})
                        if aid not in labels:
                            labels[aid] = name
                        # institutes
                        for institute in authorship['institutions']:
                            iid = institute.get('id')
                            iname = institute.get('display_name')
                            if iid and iname:
                                edges.append({'n1': aid, 'n2': iid, 'type': 'works_at'})
                                if iid not in labels:
                                    labels[iid] = iname

    if depth > 1:
        for aid in coauthor_ids:
            coauthor_net([aid], [labels[aid]], depth-1, edges, labels)

    return edges, labels
```

## Create network widget

```python
def node_properties(pos):
    node_color = []
    node_size = []
    for n in pos:
        if type(n)==str and n.startswith('https://openalex.org/I'):
            node_color.append('green')
            node_size.append(500)
        else:
            node_color.append('blue')
            node_size.append(300)
    return {'node_color': node_color, 'node_size': node_size}

    
def network_widget(edges, labels={}):
    
    if len(edges) > 0:
        G = nx.from_pandas_edgelist(pd.DataFrame(edges), 'n1', 'n2', 'type')
    else:
        G = nx.petersen_graph()
        
    pos = nx.spring_layout(G)
    
    nodes = hvnx.draw_networkx_nodes(G, pos, labels=labels, alpha=0.4, **node_properties(pos))
    edges = hvnx.draw_networkx_edges(G, pos, alpha=0.4)
    
    return nodes * edges
```

```python
# test
aids = ['https://openalex.org/A2509690250']
anames = ['Joeri Both']
edges, labels = coauthor_net(aids, anames)
```

```python
# test
#pn.panel(network_widget(edges, labels), width=800, height=800).servable()
#pn.panel(network_widget([]), width=800, height=800).servable()
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
# button to trigger co-author search
start_button = pn.widgets.Button(name='Create network', button_type='primary')

# network widget
coauthors = pn.panel(network_widget(edges=[]),  # init sample graph
                     width=800, height=800) 

def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    if not selection.empty:
        edges, labels = coauthor_net(selection.id.to_list(), selection.display_name.to_list())
    else:
        edges = []; labels = None
    coauthors.object = network_widget(edges, labels)
    
start_button.on_click(process_selection);
```

```python
template = pn.template.BootstrapTemplate(
    title='What is my coauthor network?'
)
template.main.append(
    pn.Column(
        pn.Row(autocomplete, start_button),
        candidates,
        coauthors,
        sizing_mode='stretch_both'
    )
)

# make page servable
template.servable();  # ; to prevent inline output / use preview instead
```

```python

```
