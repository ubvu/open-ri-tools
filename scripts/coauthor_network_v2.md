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
import json
import pandas as pd
from pyalex import Works

import hvplot.networkx as hvnx
import networkx as nx
from holoviews import opts

from bokeh.models import HoverTool

import plotly.graph_objects as go

pn.extension('tabulator', 'plotly')
```

# Simple coauthor network with research fields

Difference to v1
- works are not cached (caused memory overflow)
- only one network is created at a time (no year slider)

New features
- research fields
- networks of coauthors


## Backend


### Data

```python
def suggest_authors(name_part):
    if name_part:
        url_author_ac = 'https://api.openalex.org/autocomplete/authors'
        params = {'q': name_part}
        
        r = requests.get(url_author_ac, params=params)
        return pd.DataFrame(r.json()['results'])
    else:
        return pd.DataFrame()
```

```python
def fetch_concepts(author_id):
    data = Works().filter(author={'id': author_id}).group_by('concepts.id').get()
    concepts = pd.DataFrame(data) if not len(data)==0 else pd.DataFrame(columns=['key', 'key_display_name', 'count'])
    return concepts
```

```python
def fetch_works(author_ids):
    fields = ['id', 'publication_year', 'authorships']
    works = []
    works_pages = Works().filter(author={"id": '|'.join(author_ids)}).select(fields).paginate(per_page=200)
    for works_page in works_pages:
        works.extend(works_page)
    return works
```

```python
def process_works(works, author_ids, author_name):
    # extract coauthors and affiliations
    coauthors = []
    affiliations = []  # for edges: author(incl. self)-institute; keep work id for institutes cumsum
    for work in works:
        for authorship in work['authorships']:
            aid = authorship['author'].get('id')
            # add coauthors
            if aid not in author_ids:  # self is not coauthor
                name = authorship['author'].get('display_name')
                if name:
                    coauthors.append({'id': aid, 'name': name, 'year': work['publication_year']})
            else:  
                # self: only add affiliation
                aid = author_ids[0]
                name = author_name
            # add affiliations
            if name:
                for institute in authorship['institutions']:
                    iid = institute.get('id')
                    iname = institute.get('display_name')
                    if iid and iname:
                        affiliations.append({'aid': aid, 'iid': iid, 'name': iname, 'wid': work['id'], 'year': work['publication_year']})

    return pd.DataFrame(coauthors), pd.DataFrame(affiliations)
```

```python
def coauthor_agg(df):
    # coauthors (nodes): calculate the sum of works for each coauthor
    coauthors = df.copy()
    coauthors = coauthors.groupby(['id'], as_index=False).agg(name = ('name', 'first'), count = ('id', 'count'))

    return coauthors
```

```python
def institutes_agg(df):
    # 1. affiliations (edges): cumsum works author(incl. self)-institute
    affiliations = df.copy().drop(columns=['name', 'wid'])
    affiliations = affiliations.groupby(['aid', 'iid'], as_index=False).agg(count = ('aid', 'count'))
    # 2. institutes (nodes): works per institute
    institutes = df.copy().drop_duplicates(['iid', 'wid']).drop(columns=['aid', 'wid'])
    institutes = institutes.groupby(['iid'], as_index=False).agg(name = ('name', 'first'), count = ('iid', 'count'))

    return affiliations, institutes.rename({'iid': 'id'}, axis=1)
```

```python
def fetch_process_agg(author_ids, author_name):
    works = fetch_works(author_ids)
    coauthors, affiliations = process_works(works, author_ids, author_name)
    
    return coauthor_agg(coauthors), *institutes_agg(affiliations)
```

### Network

```python
def make_graph(coauthors, affiliations, institutes, author_ids, author_name):
    
    # prepare edges (affiliations)
    # add count (# works at institute) as edge attribute
    # scale count for alpha (by author, indicating affiliation strength)
    affiliations['count_norm_edge'] = (affiliations['count'] / affiliations.groupby('aid')['count'].transform(max))
    # create graph, nodes are added implicitly
    G = nx.from_pandas_edgelist(affiliations, 'aid', 'iid', edge_attr='count_norm_edge')
    
    # nodes (coauthors+institutes)
    # remove coauthors without affiliation
    coauthors = coauthors.copy()[coauthors.id.isin(affiliations.aid)]
    # set node attributes, scale for alpha (0-1)
    coauthors['count_norm'] = coauthors['count'] / coauthors['count'].max()
    institutes['count_norm'] = 1.0  # keep institute alpha at max
    # combine
    coauthors['type'] = 'author'
    institutes['type'] = 'institute'
    nodes = pd.concat([coauthors, institutes], axis=0)
    # node-attributes format: {id:{attr: a}}
    # count (alpha), name, type
    node_attributes = nodes.set_index('id').to_dict('index')
    # add self: alpha=1, name, type
    node_attributes[author_ids[0]] = {'count_norm': 1.0}
    node_attributes[author_ids[0]]['name'] = author_name
    node_attributes[author_ids[0]]['type'] = 'author'

    nx.set_node_attributes(G, node_attributes)
    
    return G
    
def make_network_widget(coauthors_from_cache):

    coauthors = coauthors_from_cache.copy()
    affiliations = cache_affi.value.copy()
    institutes = cache_inst.value.copy()
    author_ids = cache_auth.value.get('author_ids')
    author_name = cache_auth.value.get('author_name')
    
    if not coauthors.empty:
        G = make_graph(coauthors, affiliations, institutes, author_ids, author_name)
        # TODO make this an option
        G = G.subgraph(max(nx.connected_components(G), key=len))  # only selecting biggest component
    else:
        #G = nx.petersen_graph()
        G = nx.Graph()
    pos = nx.spring_layout(G)

    # create sub graphs
    if not coauthors.empty:
        nodes = hvnx.draw_networkx_nodes(G, pos)  #  labels=names
        edges = hvnx.draw_networkx_edges(G, pos)  # , alpha=dim(year)/max_cs
        graph = nodes * edges
        tooltips = [('name', '@name')]  # doesn't work for numeric keys, e.g. year number
        hover = HoverTool(tooltips=tooltips)
        hvplot = graph.opts(
            opts.Graph(
                tools=[hover, 'tap'],  # https://docs.bokeh.org/en/2.4.1/docs/user_guide/tools.html                       
                node_fill_alpha='count_norm', 
                node_line_alpha=0.3,
                edge_alpha='count_norm_edge',  # Note: name has to be different from node_fill_alpha (conflict)
                edge_line_width=1,
                node_color='type', cmap=['blue', 'green']
            )
        )
    else:
        hvplot = hvnx.draw_networkx(G, pos)

    return hvplot
```

### Bar plot

concepts / research fields

```python
def plot_concepts(df, author_name):
    if not df.empty:
        df = df.sort_values(by=['count'], ascending=False).head(10)  # top10
        fig = go.Figure(go.Bar(
            x=df['count'],
            y=df['key_display_name'],
            orientation='h'))
    else:
        fig = go.Figure()
    fig.update_layout(
        template='simple_white', 
        title=f"What is {author_name}'s research about?",
        yaxis=dict(autorange="reversed", tickmode='linear'), 
        xaxis=dict(title_text="# Works")
    )
    return fig
```

## Components 

```python
autocomplete = pn.widgets.TextInput(placeholder='Author name (press Enter to autocomplete)')
```

```python
# suggestions table, updated by pressing Enter on autocomplete (triggers suggest_authors)
candidates = pn.widgets.Tabulator(pn.bind(suggest_authors, autocomplete.param.value),
                                  sizing_mode='stretch_width',
                                  widths={'display_name': '60%', 'works_count': '40%'},
                                  show_index=False, 
                                  disabled=True,  # make non-editable
                                  selectable='toggle',  # user can select fitting candidates
                                  titles={'display_name': 'Name', 'hint': 'Work (most-cited)', 
                                          'works_count': '# Works', 'external_id': 'ID'},
                                  hidden_columns=['id', 'cited_by_count', 'entity_type', 'filter_key', 'hint', 'external_id'])
```

```python
# cache: we need these widgets for binding
cache_coau = pn.widgets.DataFrame(pd.DataFrame())
cache_affi = pn.widgets.DataFrame(pd.DataFrame())
cache_inst = pn.widgets.DataFrame(pd.DataFrame())
cache_auth = pn.widgets.JSONEditor(value={})  # author information
```

```python
# button to trigger co-author search
start_button = pn.widgets.Button(name='Create network', button_type='primary')

# network widget
network_widget = pn.bind(make_network_widget, cache_coau)   

# bar plot
concepts_bar = pn.pane.Plotly(plot_concepts(pd.DataFrame(), 'no one'), config={"responsive": False}, sizing_mode='stretch_both')

# coauthors table, for selection
table_widget = pn.widgets.Tabulator(pd.DataFrame(),
                                    titles={'name': 'Name', 'count': '#'},
                                    hidden_columns=['id'],
                                    #sorters=[{'field': 'count', 'dir': 'desc'}],
                                    disabled=True, show_index=False,
                                    sizing_mode='stretch_both'
                                   )

# 2nd degree coauthors table
table_widget2 = pn.widgets.Tabulator(pd.DataFrame(),
                                    titles={'name': 'Name', 'count': '#'},
                                    hidden_columns=['id'],
                                    disabled=True, show_index=False,
                                    sizing_mode='stretch_both'
                                   )

# display current target author
target_author = pn.pane.Markdown('')
```

## Interactivity

```python
# when triggered, updates non-table visuals
def update_data(author_ids, author_name):
    # fetch and process data, cache only after agg
    coauthors, affiliations, institutes = fetch_process_agg(author_ids, author_name)
    concepts = fetch_concepts(author_ids[0])
    # replace cache, automatically updates visuals
    cache_auth.value = {'author_ids': author_ids, 'author_name': author_name}
    cache_affi.value = affiliations
    cache_inst.value = institutes
    cache_coau.value = coauthors.sort_values(by=['count'], ascending=False)  # should be last as this triggers the bind; sort for table
    concepts_bar.object = plot_concepts(concepts, author_name)
    target_author.object = f'### {author_name}'
```

```python
# triggered when coauthor is selected in table

# table 1
def update_data_and_table2(event):
    update_data([table_widget.value.iloc[event.row]['id']], table_widget.value.iloc[event.row]['name'])
    table_widget2.value = cache_coau.value
table_widget.on_click(update_data_and_table2)

# table 2
def update_data_only(event):
    update_data([table_widget2.value.iloc[event.row]['id']], table_widget2.value.iloc[event.row]['name'])
table_widget2.on_click(update_data_only)
```

```python
# update data when create-network-button is pressed

author_ids_cache = pn.pane.JSON('[]')  # just used for selection check
def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    author_ids = json.loads(author_ids_cache.object)
    if not selection.empty:
        # fetch works only if selection is different
        if set(selection.id.to_list()) != set(author_ids):
            author_ids = selection.id.to_list()
            author_name = selection.display_name.to_list()[0]
            update_data(author_ids, author_name)
            # update table1
            table_widget.value = pd.DataFrame()  # resets scrollbar
            table_widget.value = cache_coau.value
            # reset selection
            table_widget.selection = []
            # remove table2
            table_widget2.value = pd.DataFrame()
        else:
            pass
    
start_button.on_click(process_selection);
```

## Description

```python
description = pn.pane.Markdown(
"""
(Data is fetched from [OpenAlex](https://openalex.org/))

## How to use this network

Nodes represent either coauthors (including the target author) or affiliated institutes; 
their strength corresponds to the relative number of works coauthored with the target author.
Hover over nodes to see the name of the author or institute.
Click on a node to highlight its affiliations only.
Note that the shown network is not complete; it is the largest connected component which means that only coauthors are shown who share affiliations. 
The strength of the connection corresponds to the relative number of works published by an author under an affiliated institute.
"""
)
```

## Layout

```python
template = pn.template.BootstrapTemplate(
    title='What is my coauthor network?',
    busy_indicator=pn.indicators.LoadingSpinner(size=40, value=True, color='primary', bgcolor='light')
)
template.sidebar.append(
    pn.Column(
            autocomplete, 
            start_button,
            candidates
        )
)

template.main.append(
    pn.Row(
        pn.Column(
            pn.Row(pn.pane.Markdown('### Network for'), target_author, styles=dict(background='whitesmoke')),
            pn.Row(pn.pane.Markdown('#### Select coauthor below to update data')),
            pn.Row(
                pn.Column(
                    pn.pane.Markdown('First degree'), 
                    table_widget
                ),
                pn.Column(
                    pn.pane.Markdown('Second degree'),
                    table_widget2
                )
            ),
            concepts_bar
        ),
        pn.Column(
            pn.Row(
                pn.panel(network_widget, width=500, height=500),
            ),
            description,
            sizing_mode="stretch_both",
        )
    )
)

# make page servable
template.servable();  # ; to prevent inline output / use preview instead
```

## At start-up, load demo data

```python
update_data(['https://openalex.org/A5067720298'], 'Claude E. Shannon')
table_widget.value = cache_coau.value
```

```python
#pn.panel(network_widget)
```

```python

```
