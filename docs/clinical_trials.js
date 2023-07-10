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

# In[1]:


# Panel infers Pyodide installs from these imports
import panel as pn
import pandas as pd
import requests

# necessary to render in notebook
pn.extension('plotly', 'tabulator')


# ## Backend
# 
# - Functions for data collection and transformation

# In[2]:


# retrieve citing publications from openalex
def get_citing(doi):
    
    base_url_works = 'https://api.openalex.org/works'
    df = pd.DataFrame()  # return empty df when encountering issues
    
    # get work id from doi
    params = {'filter': f'doi:{doi}'}
    r = requests.get(base_url_works, params)
    if r.status_code == 200:
        data = r.json()
        if len(data['results']) > 0:
            work_id = data['results'][0]['id']  # if multiple, take first; TODO: we can use this to retrieve data for multiple dois
            work_id = work_id.replace('https://openalex.org/', '')
            
            # obtain citing publications/pmids
            params = {'filter': f'cites:{work_id}',
                      'cursor': '*', 'per-page': 100}  # using cursor pagination
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


# In[3]:


# retrieve clinical trials from pubmed (filter)
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


# In[4]:


# main function: collect data and transform
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


# In[5]:


# when starting the application, we want to show a default dashboard using existing data
# uncomment and run this cell to update the default data / push to repo
#df = get_data('10.1136/annrheumdis-2019-216655')  # or: 10.3389/fnsys.2013.00031
#df.to_csv('../data/clinical_trials_default.csv')


# ## Load default data

# In[6]:


df_demo = pd.read_csv('https://raw.githubusercontent.com/ubvu/open-ri-tools/main/data/clinical_trials_default.csv', index_col=0)


# In[7]:


# transformations to the dataframe
# applied when loading or updating data
def transform_df(df):
    #df = df.astype(object)
    return df


# ## Plotting functions

# In[8]:


import plotly.express as px


# In[9]:


def plot_citations(df):
    agg = df.groupby(['year', 'is_trial'], as_index=False).title.count()
    fig = px.bar(agg, x="year", y="title", color='is_trial',
                 labels={'title': 'Citations', 'year': 'Year'},
                 template="simple_white")
    fig.update_xaxes(type='category')  # otherwise, ticks appear when zooming in
    return fig


# ## Components and Interactivity
# 
# - create components and bind them

# In[10]:


# main dataframe widget (not displayed), used to bind other components to
# is updated when doi is submitted and processed successfully
df_widget = pn.widgets.DataFrame(transform_df(df_demo), name='df')


# In[11]:


# text boxes
tb_doi = pn.widgets.TextInput(placeholder='Enter DOI here...')

# citation plot
citation_fig = pn.bind(plot_citations, df_widget)  # updated when df changes
pane_plot_citations = pn.pane.Plotly(citation_fig, config={"responsive": False})

# publications table
formatters = {
    'doi': {'type': 'link', 'label': '⇗', 'target': "_blank"},
    'pmid': {'type': 'link', 'urlPrefix': 'https://pubmed.ncbi.nlm.nih.gov/', 'label': '⇗', 'target': "_blank"},
    'is_trial': {'type': 'tickCross'},
    'year': {'type': 'int'}
}
# fix title width (~40%), distribute rest equally
cols = df_widget.value.columns; w_rest = 60/(len(cols)-1)
widths = {c:f'{w_rest}%' if c != 'title' else f'{100-(w_rest*(len(cols)-1))}%' for c in df_widget.value.columns}
widget_table = pn.widgets.Tabulator(df_widget,  # implicitly binds table to df
                                    formatters=formatters, sizing_mode="stretch_both", show_index=False, widths=widths)
# table filters
# checkbox
cb_trial = pn.widgets.Checkbox(name='show clinical trials')
# slider
# year range needs to be calculated first
def year_range(df):
    return {'start': int(df.year.min()), 'end': int(df.year.max())}
# year range binds to df via refs argument
slider_year = pn.widgets.IntRangeSlider(refs=pn.bind(year_range, df_widget), **year_range(df_widget.value))  # start/end defaults needed
# add to table
widget_table.add_filter(cb_trial, 'is_trial')
widget_table.add_filter(slider_year, 'year')


# In[12]:


# test
#pane_plot_citations.servable()


# In[13]:


# test
#pn.Row(cb_trial, slider_year, widget_table).servable()


# In[14]:


# test: observe updates when df changes
#df_widget.value = df_demo[df_demo.year==2020]


# In[15]:


# text/doi input triggers data update and yields current status (via generator)
# note on generators: only yield, return breaks the execution
def update_data(doi=None):
    if not doi: 
        yield ''  # show nothing when initializing
    else:
        yield 'Search in progress...'
        df = get_data(doi)
        if df.empty:
            yield 'Invalid DOI or no data available'  
        else:
            df_widget.value = transform_df(df)  # triggers updates
            yield 'Done'

status_text = pn.bind(update_data, tb_doi)


# In[16]:


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


# ## Layout
# 
# - add components to page

# In[17]:


template = pn.template.BootstrapTemplate(
    title='Is my research used in clinical trials?'
)
template.main.append(
    pn.Row(
        pn.Column(
            tb_doi,
            status_text,
            pane_plot_citations
        ),
        pn.Column(
            pn.Row(cb_trial, slider_year),
            widget_table
        )
    )
)

# make page servable
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