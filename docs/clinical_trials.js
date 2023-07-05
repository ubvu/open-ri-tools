importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.0/full/pyodide.js");

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
  const env_spec = ['markdown-it-py<3', 'https://cdn.holoviz.org/panel/1.1.1/dist/wheels/bokeh-3.1.1-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.1.1/dist/wheels/panel-1.1.1-py3-none-any.whl', 'pyodide-http==0.2.1', 'pandas', 'plotly', 'requests']
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
import pandas as pd
import requests

pn.extension('plotly', 'tabulator')


# ## Functions

# In[ ]:


def get_citing(doi):
    
    base_url_works = 'https://api.openalex.org/works'
    df = pd.DataFrame()
    
    # get work id
    params = {'filter': f'doi:{doi}'}
    r = requests.get(base_url_works, params)
    if r.status_code == 200:
        data = r.json()
        if len(data['results']) > 0:
            work_id = data['results'][0]['id']  # if multiple, take first
            work_id = work_id.replace('https://openalex.org/', '')
            
            # obtain citing documents/pmids
            params = {'filter': f'cites:{work_id}',
                      'cursor': '*', 'per-page': 100}
            records = []
            done = False
            while not done:
                r = requests.get(base_url_works, params)
                data = r.json()
                for work in data['results']:
                    record = {
                        'title': work.get('title'),
                        'year': work.get('publication_year'),
                        'doi': work.get('doi'),
                        'pmid': work['ids'].get('pmid')
                    }
                    records.append(record)
                if data['meta']['next_cursor']:
                    params['cursor'] = data['meta']['next_cursor']
                else:
                    done = True
    df = pd.DataFrame(records)        
    return df


# In[ ]:


def get_clinical_trials(pmids):
    
    search_url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
    
    query = ' OR '.join([f'{pmid}[pmid]' for pmid in pmids]) + ' AND (clinicaltrial[Filter])'
                                                                     
    data = {'term': query.encode('utf-8'), 'db': 'pubmed', 'retmax': 10000, 'retmode': 'json'}
    # https://stackoverflow.com/questions/55887958/what-is-the-default-encoding-when-python-requests-post-data-is-string-type
    headers={'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
             'Accept': 'application/json'}
    r = requests.post(search_url, data=data, headers=headers)
    data = r.json()['esearchresult']
    
    return data['idlist']


# In[ ]:


def get_data(doi):
    df = get_citing(doi)
    if not df.empty:
        df['pmid'] = df.pmid.apply(lambda x: 
                                   x.replace('https://pubmed.ncbi.nlm.nih.gov/', '')
                                   if not pd.isna(x) else x)
        pmids = df.pmid.dropna().to_list()
        pmids_trial = get_clinical_trials(pmids)
        df['is_trial'] = df.pmid.isin(pmids_trial)
    return df


# In[ ]:


# create df to load when application starts; store in repo and fetch from url
#df = get_data('10.1136/annrheumdis-2019-216655')
#df.to_csv('../data/clinical_trials_default.csv')


# ## Load (default) data

# In[ ]:


df = pd.read_csv('https://raw.githubusercontent.com/ubvu/open-ri-tools/main/data/clinical_trials_default.csv', index_col=0)


# ## Plots

# In[ ]:


import plotly.express as px


# In[ ]:


def plot_citations(df):
    agg = df.groupby(['year', 'is_trial'], as_index=False).title.count()
    fig = px.bar(agg, x="year", y="title", color='is_trial',
                 labels={'title': 'Citations', 'year': 'Year'},
                 template="simple_white")
    return fig


# ## Components

# In[ ]:


# Text boxes
text_box_doi = pn.widgets.TextInput(placeholder='Enter DOI here...')
text_box_status = pn.pane.Str('')

# Citation plot
pane_plot_citations = pn.pane.Plotly(plot_citations(df), config={"responsive": False})

# pie chart ratio trials (from pubmed records)
#trials_pie =

# publications table
#trials_table = pn.pane.DataFrame(df, index=False, render_links=True, sizing_mode="stretch_both")
formatters = {
    'doi': {'type': 'link', 'label': 'open', 'target': "_blank"},
    'pmid': {'type': 'link', 'urlPrefix': 'https://pubmed.ncbi.nlm.nih.gov/', 'label': 'open', 'target': "_blank"},
    'is_trial': {'type': 'tickCross'},
    'year': {'type': 'int'}
}
widget_table = pn.widgets.Tabulator(df, formatters=formatters, sizing_mode="stretch_both",
                                    widths={'index': '5%', 'title': '30%', 'year': '20%', 'doi': '15%', 'pmid': '15%', 'is_trial': '15'})


# In[ ]:


# test
#pane_plot_citations.servable()


# In[ ]:


# test
#widget_table = pn.widgets.Tabulator(df[['doi', 'pmid']], formatters=formatters)
#widget_table.servable()


# ## Interactivity

# In[ ]:


# # plotly click_data does not work at this point:
# # https://github.com/holoviz/panel/issues/5096
# @pn.depends(citation_years.param.click_data, watch=True)
# def trials_table(event, df=df):
#     try:
#         year = round(event["points"][0]["x"],0)
#     except:
#         year = 2021
#     dff = df[df.year==year]
#     return pn.pane.DataFrame(dff, index=False, render_links=True, sizing_mode="stretch_both")


# In[ ]:


# table filter
cb_trial = pn.widgets.Checkbox(name='show clinical trials')
#slider_year = pn.widgets.IntSlider(name='year')
# TODO slider has to be linked (.bind) to the df

widget_table.add_filter(cb_trial, 'is_trial')
#widget_table.add_filter(slider_year, 'year')


# In[ ]:


# test
#pn.Column(cb_trial, widget_table).servable()


# In[ ]:


# Entering a DOI
def callback(target, event):
    target.object = 'Search in progress...'
    df = get_data(event.new.strip())
    if df.empty:
        target.object = 'Invalid DOI or no data available'  
    else:
        pane_plot_citations.object = plot_citations(df)
        # df[~pd.isna(df.pmid)]
        widget_table.value = df 
        target.object = 'Done'
        
text_box_doi.link(text_box_status, callbacks={'value': callback});


# ## Layout

# In[ ]:


template = pn.template.BootstrapTemplate(
    title='Is my research used in clinical trials?'
)
template.main.append(
    pn.Row(
        pn.Column(
            text_box_doi,
            text_box_status,
            pane_plot_citations
        ),
        pn.Column(
            #pn.pane.Markdown('## Clinical Trials:'),
            #trials_pie,
            cb_trial,
            widget_table
        )
    )
)

template.servable();  # ; to prevent inline output / use preview instead


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