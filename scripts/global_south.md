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
from datetime import datetime as dt
import plotly.express as px

pn.extension('tabulator', 'plotly')
```

## Backend

```python
def suggest_institutes(name_part):

    if name_part:
        url_author_ac = 'https://api.openalex.org/autocomplete/institutions'
        params = {'q': name_part}
        
        r = requests.get(url_author_ac, params=params)
        return pd.DataFrame(r.json()['results'])
    else:
        return pd.DataFrame()
```

```python
def get_percentage_gs_per_year(afids=None):
    n =  10  # last x years
    current_year = dt.now().year
    years = [str(i) for i in range(current_year-n-1, current_year+1)]
    data = []
    # api calls
    # global
    wgs_glob = Works().filter(authorships={'institutions': {'is_global_south': True}},
                             publication_year='|'.join(years)).group_by('publication_year').get()
    wgn_glob = Works().filter(authorships={'institutions': {'is_global_south': False}},
                                 publication_year='|'.join(years)).group_by('publication_year').get()
    data.append((wgs_glob, wgn_glob))
    if afids:
        # with global south
        wgs_loc = Works().filter(authorships={'institutions': {'id': '|'.join(afids), 'is_global_south': True}},
                             publication_year='|'.join(years)).group_by('publication_year').get()
        # only global north
        wgn_loc = Works().filter(authorships={'institutions': {'id': '|'.join(afids), 'is_global_south': False}},
                             publication_year='|'.join(years)).group_by('publication_year').get()
        data.append((wgs_loc, wgn_loc))
    # merge (groupby is unordered) and calculate percentage
    # for institute and globally
    dfs = []
    for wgs, wgn in data:
        # use dummy if empty (e.g. if institute in global south)
        wgs = pd.DataFrame(wgs) if not len(wgs)==0 else pd.DataFrame(columns=['key', 'count'])
        wgn = pd.DataFrame(wgn) if not len(wgn)==0 else pd.DataFrame(columns=['key', 'count'])
        df = pd.DataFrame({'year': years})
        df = df.merge(wgs.rename({'count': 'count_south'}, axis=1), how='left', left_on='year', right_on='key')
        df = df.merge(wgn.rename({'count': 'count_north'}, axis=1), how='left', left_on='year', right_on='key')
        # fillna with 0 (=works)
        df = df.fillna(0)
        df[''] = round((df.count_south / (df.count_south+df.count_north))*100,1)
        dfs.append(df[['year', '']])

    if afids:               
        return dfs[0].merge(dfs[1], how='left', on='year', suffixes=('global', 'local'))
    else:
        return dfs[0].rename({'': 'global'}, axis=1)
```

## Components


### Autocomplete

```python
autocomplete = pn.widgets.TextInput(placeholder='Institute name (press Enter to autocomplete)')
```

```python
candidates = pn.widgets.Tabulator(pn.bind(suggest_institutes, autocomplete.param.value),
                                  sizing_mode='stretch_width',
                                  #widths={'display_name': '60%', 'works_count': '40%'},
                                  show_index=False, 
                                  disabled=True,  # make non-editable
                                  selectable='toggle',  # user can select fitting candidates
                                  titles={'display_name': 'Name', 'works_count': '# Works'},
                                  hidden_columns=['works_count','id', 'cited_by_count', 'entity_type', 'filter_key', 'hint', 'external_id']
                                 )
```

### Fetch data

```python
# cache df/table
df_cache = pn.widgets.DataFrame(get_percentage_gs_per_year())  # default is global-only

# button to trigger data retrieval
start_button = pn.widgets.Button(name='Get data', button_type='primary')

def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    if not selection.empty:
        df_cache.value = get_percentage_gs_per_year(selection.id.to_list())
    
start_button.on_click(process_selection);
```

### Plot

```python
def plot_graph(df):
    fig = px.line(df, x="year", y=[c for c in df.columns if c!='year'],
                 labels={'value': '% works with at least 1 gs author', 'year': 'Year', 'variable': ''},
                 template="simple_white")
    fig.update_xaxes(type='category')  # otherwise, ticks appear when zooming in
    return fig
```

```python
# test
#afid = 'https://openalex.org/I69737025'  # https://openalex.org/I865915315
#df = get_percentage_gs_per_year([afid])
```

```python
#plot_graph(df)
```

```python
# plot
plot_obj = pn.bind(plot_graph, df_cache)  # updated when df changes
plot_pane = pn.pane.Plotly(plot_obj, config={"responsive": False})
```

## Description

```python
description = pn.pane.Markdown(
"""


## Explanation
Using [OpenAlex](https://openalex.org/), we fetch a given institution's publication counts for the last 10 years.

Counts are fetched for publications with 0 or >=1 coauthors from the global south and the ratio is shown (*local*).

We also show the global ratio for comparison.
Countries are classified as global south based on [UN definitions](https://docs.openalex.org/api-entities/geo/regions#global-south).
"""
)
```

## Layout

```python
template = pn.template.BootstrapTemplate(
    title='Does my institute collaborate with the global south?',
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
    pn.Column(plot_pane, description)
)
template.servable();
```

```python

```
