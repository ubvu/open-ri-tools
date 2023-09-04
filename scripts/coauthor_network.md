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
from holoviews import HoloMap
import networkx as nx

pn.extension('tabulator', 'plotly')
```

```python
offline = True  # when developing offline we load local data
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
def extract_coauthors(works, author_ids, author_name):

    coauthors = []; affiliations = []
    
    for work in works:
        for authorship in work['authorships']:
            aid = authorship['author'].get('id')
            # add coauthors
            if aid not in author_ids:  # don't add edge with self
                name = authorship['author'].get('display_name')
                if name:  # without a name, don't include in network
                    coauthors.append({'id': aid, 'name': name, 'year': work['publication_year']})
            else:  # only add affiliation (e.g. for self)
                aid = author_ids[0]
                name = author_name
            # add affiliations
            if name:
                for institute in authorship['institutions']:
                    iid = institute.get('id')
                    iname = institute.get('display_name')
                    if iid and iname:
                        affiliations.append({'id': aid, 'iid': iid, 'name': iname, 'year': work['publication_year']})

    return pd.DataFrame(coauthors), pd.DataFrame(affiliations)
```

```python
def calc_works_cumsum(df):
    # per year, calculate the cumulative sum of works for each coauthor
    
    coauthors = df.copy()
    # works per year
    coauthors = coauthors.groupby(['id', 'year'], as_index=False).agg(name = ('name', 'first'), count = ('id', 'count'))
    # add missing years (we use multi index to create a id*year matrix)
    mindex = pd.MultiIndex.from_product([coauthors.id.unique(), range(coauthors.year.min(), coauthors.year.max()+1)],
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
# def calc_works_cumsum_aff(df, author_ids):
#     affiliations = df.copy()

#     e_prim = edges.copy()[(edges.type=='works_at') & (edges.n1 == author_ids[0])]  # primary affiliations
#     # connect co-author affiliations to main author (secondary affiliations)
#     e_scnd =  edges.copy()[(edges.type=='works_at') & (edges.n1 != author_ids[0])]
#     e_scnd['type'] = 'related_to'
#     e_scnd['n1'] = author_ids[0]
#     # primary over secondary
#     e_scnd = e_scnd[~e_scnd.n2.isin(e_prim.n2)]
#     return pd.concat([e_prim, e_scnd], axis=0).drop_duplicates()
```

Test backend

```python
# aids = ['https://openalex.org/A5076642362']  # https://openalex.org/A5028049278
# works = fetch_works(aids, ['publication_year', 'authorships'])
# coauthors, affiliations = extract_coauthors(works, aids, 'test_name')
```

```python
# calc_works_cumsum(coauthors)
```

### Network

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


def make_graph(edges: pd.DataFrame, labels=None):
    if not edges.empty:
        G = nx.from_pandas_edgelist(edges, 'n1', 'n2', 'type')
    else:
        G = nx.petersen_graph()  
    pos = nx.spring_layout(G)
    return G, pos

    
def network_widget(G, pos, year):

    # create nodes, edges with properties

    # nodes
    g_nodes = hvnx.draw_networkx_nodes(G, pos, labels=labels, alpha=0.4, **node_properties(pos))
    # edges and line types
    esolid = []; edashd = []
    for (u, v, attr) in G.edges(data=True):
        if attr.get('type', '') == 'related_to':
            edashd.append((u, v))
        else:
            esolid.append((u, v))
    g_edges1 = hvnx.draw_networkx_edges(G, pos, edgelist=esolid, edge_width=4 if len(edashd)>0 else 1, alpha=0.7, style='solid')  # increase width when mixed with dashed
    g_edges2 = hvnx.draw_networkx_edges(G, pos, edgelist=edashd, edge_width=1, alpha=0.7, style='dashed')
    return g_nodes * g_edges1 * g_edges2
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

# list to persist fetched works
works_pane = pn.pane.JSON('[]')
author_ids_pane = pn.pane.JSON('[]')

# network widget
#def create_holomap():
#    hm_default = HoloMap({i: network_widget(pd.DataFrame()) for i in range(3)})
if not debug:
    coauthors = pn.panel(HoloMap({i: network_widget(pd.DataFrame()) for i in range(10)}), sizing_mode='stretch_both')    
else:
    with open('../data/coauthors_dev.json', 'r') as f:
        works = json.loads(f.read())
    author_ids = ['https://openalex.org/A5028049278']
    author_name = 'test author'
    works_by_year_cum = {}
    for work in works:
        year = work['publication_year']
        if year not in works_by_year_cum:
            works_by_year_cum[year] = [work]
        else:
            works_by_year_cum[year].append(work)
        for y in works_by_year_cum:
            if year<y:
                works_by_year_cum[y].append(work)
    edges = []; labels = []; years = []
    for y in works_by_year_cum:
        e, l = coauthor_net(works_by_year_cum[y], author_ids, author_name)
        edges.append(e); labels.append(l); years.append(y)
    coauthors = pn.panel(HoloMap({int(y): network_widget(e, l) for e, l, y in zip(edges, labels, years)}, kdims='Publication year'), sizing_mode='stretch_both')

# affiliations-only checkbox
cb_aff = pn.widgets.Checkbox(name='Affiliations only')

## year animiation
cb_year = pn.widgets.Checkbox(name='Publication year')

def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    works = []
    # fetch works only if selection is different
    author_ids = json.loads(author_ids_pane.object)
    if not selection.empty:
        if set(selection.id.to_list()) != set(author_ids):
            author_ids = selection.id.to_list()
            author_ids_pane.object = json.dumps(author_ids)
            works = fetch_works(author_ids, ['publication_year', 'authorships'])
            works_pane.object = json.dumps(works)
        else:
            works = json.loads(works_pane.object)
        author_name = selection.display_name.to_list()[0]
    # load local works when in debug mode
    elif debug:
        with open('../data/coauthors_dev.json', 'r') as f:
            works = json.loads(f.read())
        author_ids = ['https://openalex.org/A5028049278']
        author_name = 'test author'
    if len(works) > 0:
        # create network
        if not cb_year.value:
            edges, labels = coauthor_net(works, author_ids, author_name)
            # show affiliations only?
            if cb_aff.value:
                edges = extract_affiliations(edges, author_ids)
        else:
            works_by_year_cum = {}
            for work in works:
                year = work['publication_year']
                if year not in works_by_year_cum:
                    works_by_year_cum[year] = [work]
                else:
                    works_by_year_cum[year].append(work)
                for y in works_by_year_cum:
                    if year<y:
                        works_by_year_cum[y].append(work)
            edges = []; labels = []; years = []
            for y in works_by_year_cum:
                e, l = coauthor_net(works_by_year_cum[y], author_ids, author_name)
                edges.append(e); labels.append(l); years.append(y)
    else:
        edges = pd.DataFrame(); labels = None
    if type(edges)==pd.DataFrame:
        coauthors.object = network_widget(edges, labels)
    elif type(edges)==list:
        pass
        #hm = {int(y): network_widget(e, l) for e, l, y in zip(edges, labels, years)}
        #coauthors.parobject = HoloMap({i:hm[k] for i, k in enumerate(hm) if i<=2}, kdims='Publication year')
    
start_button.on_click(process_selection);
```

```python
#coauthors_panel = pn.panel(pn.bind(create_holomap, works_pane))
```

```python
template = pn.template.BootstrapTemplate(
    title='What is my coauthor network?'
)
template.sidebar.append(
    pn.Column(
            autocomplete, 
            start_button,
            candidates,
            cb_aff,
            cb_year,
            #coauthors[1]  # widgets of the HoloMap, TODO: when coauthors is single network, this won't work
        )
)
template.main.append(
    pn.Row(
        coauthors,
        #sizing_mode='stretch_both'  # -> caused issues with toggling in tabulator
    )
)

# make page servable
template.servable();  # ; to prevent inline output / use preview instead
```

## Dev

```python
# for dev: retrieve works of known author
#aids = ['https://openalex.org/A5076642362']  # https://openalex.org/A5028049278
#works = fetch_works(aids, ['publication_year', 'authorships'])
# store locally
#with open('../data/coauthors_dev.json', 'w') as f:
#    f.write(json.dumps(works))
```

```python
# test network
#anames = ['test_author']
#edges, labels = coauthor_net(works, aids, anames)
```

```python
#extract_affiliations(edges, aids)
```

```python
#pn.panel(network_widget(edges, labels), width=800, height=800).servable()
#pn.panel(network_widget([]), width=800, height=800).servable()
```

```python

```
