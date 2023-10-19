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
from holoviews import HoloMap, dim
from holoviews.util import Dynamic
from holoviews import opts

from bokeh.models import HoverTool

pn.extension('tabulator', 'plotly')
```

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
def fetch_works(author_ids, fields):
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
    years = set()  # years for authors and institutes might differ
    
    for work in works:
        years.add(work['publication_year'])
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

    return pd.DataFrame(coauthors), pd.DataFrame(affiliations), list(years)
```

```python
def coauthor_cumsum(df, years):
    # coauthors (nodes): per year, calculate the cumulative sum of works for each coauthor
    coauthors = df.copy()
    # works per year
    coauthors = coauthors.groupby(['id', 'year'], as_index=False).agg(name = ('name', 'first'), count = ('id', 'count'))
    # add missing years (we use multi index to create a id*year matrix)
    mindex = pd.MultiIndex.from_product([coauthors.id.unique(), range(min(years), max(years)+1)],
                                        names = ['id', 'year'])
    coauthors = pd.DataFrame(index=mindex).merge(coauthors, how='left', left_index=True, right_on=['id', 'year'])
    # NA = 0 (works), however: name stays the same
    coauthors['name'] = coauthors.groupby('id')['name'].transform(lambda x: x.fillna(x.dropna().unique()[0]))
    coauthors['count'] = coauthors.groupby('id')['count'].transform(lambda x: x.fillna(0))
    # cumsum
    coauthors['cumsum'] = coauthors.groupby('id')['count'].cumsum()

    return coauthors
```

```python
def institutes_cumsum(df, years):
    # 1. affiliations (edges): cumsum works author(incl. self)-institute
    affiliations = df.copy().drop(columns=['name', 'wid'])
    affiliations = affiliations.groupby(['aid', 'iid', 'year'], as_index=False).agg(count = ('aid', 'count'))
    # add missing years (see above)
    mindex = pd.MultiIndex.from_product([affiliations.aid.unique(), affiliations.iid.unique(), 
                                         range(min(years), max(years)+1)],
                                        names = ['aid', 'iid', 'year'])
    affiliations = pd.DataFrame(index=mindex).merge(affiliations, how='left', left_index=True, right_on=['aid', 'iid', 'year'])
    # we just combined all authors with all institutes, i.e. remove those without affiliations/edges
    affiliations = affiliations[~affiliations.groupby(['aid', 'iid'])['count'].transform(lambda x: all(pd.isna(x)))]
    # NA = 0 (works)
    affiliations['count'] = affiliations.groupby(['aid', 'iid'])['count'].transform(lambda x: x.fillna(0))
    # cumsum
    affiliations['cumsum'] = affiliations.groupby(['aid', 'iid'])['count'].cumsum()
    
    # 2. institutes (nodes): cumsum works per institute per year
    institutes = df.copy().drop_duplicates(['iid', 'wid']).drop(columns=['aid', 'wid'])
    institutes = institutes.groupby(['iid', 'year'], as_index=False).agg(name = ('name', 'first'), count = ('iid', 'count'))
    # add missing years (see above)
    mindex = pd.MultiIndex.from_product([institutes.iid.unique(), range(min(years), max(years)+1)],
                                        names = ['iid', 'year'])
    institutes = pd.DataFrame(index=mindex).merge(institutes, how='left', left_index=True, right_on=['iid', 'year'])
    # NA = 0 (works), however: name stays the same
    institutes['name'] = institutes.groupby('iid')['name'].transform(lambda x: x.fillna(x.dropna().unique()[0]))
    institutes['count'] = institutes.groupby('iid')['count'].transform(lambda x: x.fillna(0))
    # cumsum
    institutes['cumsum'] = institutes.groupby('iid')['count'].cumsum()

    return affiliations, institutes.rename({'iid': 'id'}, axis=1)
```

### Network

```python
def make_graph(coauthors, affiliations, years, author_ids, author_name):
    
    # prepare edges (affiliations)
    # add year:cumsum as attributes
    affiliations, institutes = institutes_cumsum(affiliations, years)
     # scale cumsum to alpha (by author, indicating affiliation strength)
    affiliations['cumsum'] = (affiliations['cumsum'] / affiliations.groupby('aid')['cumsum'].transform(max))
    # NOTE holoviews dimensions don't work well with numeric attributes e.g. 2010 (or '2010')
    # add a prefix to prevent errors
    affiliations['year'] = 'y' + affiliations.year.astype(str)
    # from_pandas_edgelist requires wide format for attributes
    affiliations = affiliations.pivot(index=['aid', 'iid'], columns='year', values='cumsum')
    affiliations = affiliations.reset_index()
    # create graph
    G = nx.from_pandas_edgelist(affiliations, 'aid', 'iid', edge_attr=True)
    
    # nodes (coauthors+institutes)
    coauthors = coauthor_cumsum(coauthors, years)
    # coauthors without affiliations have to be added manually
    extra_coauthors_ids = coauthors[~coauthors.id.isin(affiliations.aid)].id.to_list()
    G.add_nodes_from(extra_coauthors_ids)
    # set node attributes, add year:cumsum as well
    # scale to alpha (0-1)
    coauthors['cumsum'] = coauthors['cumsum'] / coauthors['cumsum'].max()
    institutes['cumsum'] = institutes['cumsum'] / institutes['cumsum'].max()
    # combine
    coauthors['type'] = 'author'
    institutes['type'] = 'institute'
    nodes = pd.concat([coauthors, institutes], axis=0)
    # year->cumsum as attributes
    nodes['year'] = 'y' + nodes.year.astype(str)
    # node-attributes format: {id:{attr: a}}
    node_attributes = nodes.pivot(index=['id'], columns='year', values='cumsum').to_dict('index')
    # add name and type (author/institute)
    extra_attributes = nodes[['id', 'name', 'type']].drop_duplicates(['id']).set_index('id').to_dict('index')
    for node in node_attributes:
        node_attributes[node]['name'] = extra_attributes[node]['name']
        node_attributes[node]['type'] = extra_attributes[node]['type']
    # add self: alpha=1, name, type
    node_attributes[author_ids[0]] = {'y'+str(y): 1 for y in years}
    node_attributes[author_ids[0]]['name'] = author_name
    node_attributes[author_ids[0]]['type'] = 'author'
    
    nx.set_node_attributes(G, node_attributes)

    # years for slider 
    slider_years = [str(y) for y in years]
    
    return G, slider_years
    
def make_network_widget(data_cache):
 
    works = data_cache.get('works', []) 
    author_ids = data_cache.get('author_ids')
    author_name = data_cache.get('author_name')
    
    coauthors, affiliations, years = process_works(works, author_ids, author_name)

    if not coauthors.empty:
        G, years = make_graph(coauthors, affiliations, years, author_ids, author_name)
        # TODO make this an option
        G = G.subgraph(max(nx.connected_components(G), key=len))  # only selecting biggest component
    else:
        G = nx.petersen_graph()  
    pos = nx.spring_layout(G)

    # create sub graphs
    if not coauthors.empty:
        hvplots = {}
        for year in years:
            nodes = hvnx.draw_networkx_nodes(G, pos)  #  labels=names
            edges = hvnx.draw_networkx_edges(G, pos)  # , alpha=dim(year)/max_cs
            graph = nodes * edges
            tooltips = [('name', '@name')]  # doesn't work for numeric keys, e.g. year number
            hover = HoverTool(tooltips=tooltips)
            hvplots[int(year)] = graph.opts(opts.Graph(
                                                       tools=[hover, 'tap'],  # https://docs.bokeh.org/en/2.4.1/docs/user_guide/tools.html
                                                       node_fill_alpha='y'+year, node_line_alpha=0.3,
                                                       edge_alpha='y'+year,
                                                       edge_line_width=1,
                                                       node_color='type', cmap=['blue', 'green'],
                                                       #edge_hover_line_color='yellow', node_hover_fill_color='yellow'
                                                      )
                                           )
    else:
        hvplots = {1984: hvnx.draw_networkx(G, pos)}
        
    # create HoloMap
    hm = HoloMap(hvplots, kdims='Year')
    return Dynamic(hm)
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
                                  #widths={'hint': '40%'},
                                  show_index=False, 
                                  disabled=True,  # make non-editable
                                  selectable='toggle',  # user can select fitting candidates
                                  titles={'display_name': 'Name', 'hint': 'Work (most-cited)', 
                                          'works_count': '# Works', 'external_id': 'ID'},
                                  hidden_columns=['id', 'cited_by_count', 'entity_type', 'filter_key', 'hint', 'external_id'])
```

```python
# button to trigger co-author search
start_button = pn.widgets.Button(name='Create network', button_type='primary')

# list to persist fetched works and author data
data_cache = pn.widgets.JSONEditor(value={})
author_ids_cache = pn.pane.JSON('[]')  # just used for selection check

# network widget
network_widget = pn.bind(make_network_widget, data_cache)    

# affiliations-only checkbox
#cb_aff = pn.widgets.Checkbox(name='Affiliations only')

def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    works = []
    author_ids = json.loads(author_ids_cache.object)
    if not selection.empty:
        # fetch works only if selection is different
        if set(selection.id.to_list()) != set(author_ids):
            author_ids = selection.id.to_list()
            works = fetch_works(author_ids, ['id', 'publication_year', 'authorships'])
            # replace cache
            author_ids_cache.object = json.dumps(author_ids)
            data_cache.value = {'works': works, 'author_ids': author_ids, 'author_name': selection.display_name.to_list()[0]}
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

Nodes represent either coauthors (including the target author) or affiliated institutes.
Hover over nodes to see the name of the author or institute.
Click on a node to highlight its affiliations only.


## How to interpret the network

Initially, no connections are shown - by moving the year slider, more and more connections appear; 
the strength of the connection corresponds to the relative number of works published by an author under an affiliated institute.
Node strength, on the other hand, corresponds to the relative number of works coauthored with the target author. 
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
            candidates,
            description
        )
)
template.main.append(
    pn.Column(
        pn.Row(
            pn.panel(network_widget, widget_location='right_top', width=500, height=500),
        )
    )
)

# make page servable
template.servable();  # ; to prevent inline output / use preview instead
```

## Dev

```python
# # for dev: retrieve works of known author
# aids = ['https://openalex.org/A5050656020']  # https://openalex.org/A5076642362
# works = fetch_works(aids, ['id', 'publication_year', 'authorships'])
# coauthors, affiliations, years = process_works(works, aids, 'test_name')
# hm = make_network_widget({'works': works, 'author_ids': aids, 'author_name': 'test_name'})
```

```python
# pn.panel(hm, sizing_mode = 'stretch_both')[1].servable()
```

```python

```
