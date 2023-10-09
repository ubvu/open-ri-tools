importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/pyc/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/1.2.1/dist/wheels/bokeh-3.2.1-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.2.1/dist/wheels/panel-1.2.1-py3-none-any.whl', 'pyodide-http==0.2.1', 'pandas', 'plotly', 'pyalex', 'requests']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# In[ ]:


import panel as pn

import requests
import json
import pandas as pd
from pyalex import Works
from datetime import datetime as dt
import plotly.express as px

pn.extension('tabulator', 'plotly')


# ## Backend

# In[ ]:


def suggest_institutes(name_part):

    if name_part:
        url_author_ac = 'https://api.openalex.org/autocomplete/institutions'
        params = {'q': name_part}
        
        r = requests.get(url_author_ac, params=params)
        return pd.DataFrame(r.json()['results'])
    else:
        return pd.DataFrame()


# In[ ]:


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


# ## Components

# ### Autocomplete

# In[ ]:


autocomplete = pn.widgets.TextInput(placeholder='Institute name (press Enter to autocomplete)')


# In[ ]:


candidates = pn.widgets.Tabulator(pn.bind(suggest_institutes, autocomplete.param.value),
                                  sizing_mode='stretch_width',
                                  #widths={'display_name': '60%', 'works_count': '40%'},
                                  show_index=False, 
                                  disabled=True,  # make non-editable
                                  selectable='toggle',  # user can select fitting candidates
                                  titles={'display_name': 'Name', 'works_count': '# Works'},
                                  hidden_columns=['works_count','id', 'cited_by_count', 'entity_type', 'filter_key', 'hint', 'external_id']
                                 )


# ### Fetch data

# In[ ]:


# cache df/table
df_cache = pn.widgets.DataFrame(get_percentage_gs_per_year())  # default is global-only

# button to trigger data retrieval
start_button = pn.widgets.Button(name='Get data', button_type='primary')

def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    if not selection.empty:
        df_cache.value = get_percentage_gs_per_year(selection.id.to_list())
    
start_button.on_click(process_selection);


# ### Plot

# In[ ]:


def plot_graph(df):
    fig = px.line(df, x="year", y=[c for c in df.columns if c!='year'],
                 labels={'value': '% works with at least 1 gs author', 'year': 'Year', 'variable': ''},
                 template="simple_white")
    fig.update_xaxes(type='category')  # otherwise, ticks appear when zooming in
    return fig


# In[ ]:


# test
#afid = 'https://openalex.org/I69737025'  # https://openalex.org/I865915315
#df = get_percentage_gs_per_year([afid])


# In[ ]:


#plot_graph(df)


# In[ ]:


# plot
plot_obj = pn.bind(plot_graph, df_cache)  # updated when df changes
plot_pane = pn.pane.Plotly(plot_obj, config={"responsive": False})


# ## Layout

# In[ ]:


template = pn.template.BootstrapTemplate(
    title='Does my institute collaborate with the global south?'
)
template.sidebar.append(
    pn.Column(
            autocomplete, 
            start_button,
            candidates
        )
)
template.main.append(
    pn.Column(plot_pane)
)
template.servable();


# In[ ]:






await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()