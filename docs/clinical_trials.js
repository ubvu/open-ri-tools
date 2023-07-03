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


import panel as pn
pn.extension('plotly')

import requests
import pandas as pd


# In[2]:


def get_citing(doi):
    
    base_url_works = 'https://api.openalex.org/works'
    
    # get work id
    params = {'filter': f'doi:{doi}'}
    r = requests.get(base_url_works, params)
    data = r.json()
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
            #pmid = work['ids'].get('pmid')
            #if pmid:
            #    pmids.add(pmid.replace('https://pubmed.ncbi.nlm.nih.gov/', ''))
            records.append(record)
        if data['meta']['next_cursor']:
            params['cursor'] = data['meta']['next_cursor']
        else:
            done = True
    
    return pd.DataFrame(records)


# In[3]:


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


#def get_metric(doi):
#    pmids = get_citing_pmids(doi)
#    pmids_t =  get_clinical_trials(pmids)
#    return round(len(pmids_t)/len(pmids)*100,2)  


# In[5]:


def get_data(doi):
    df = get_citing(doi)
    df['pmid'] = df.pmid.apply(lambda x: 
                               x.replace('https://pubmed.ncbi.nlm.nih.gov/', '')
                               if not pd.isna(x) else x)
    pmids = df.pmid.dropna().to_list()
    pmids_trial = get_clinical_trials(pmids)
    df['is_trial'] = df.pmid.isin(pmids_trial)
    return df


# In[6]:


# test
#test_doi = '10.1136/annrheumdis-2019-216655'
#test_df = get_data(test_doi)


# In[7]:


# mock df
# df = 


# In[8]:


import plotly.express as px


# In[9]:


output_status = pn.pane.Str('')
#output_ratio = pn.indicators.Number(name='Ratio', value=0, format='{value}%')
input_doi = pn.widgets.TextInput(placeholder='Enter DOI here...')

# citations over the years
citation_years = pn.pane.Plotly()

# pie chart ratio trials (from pubmed records)
#trials_pie =

# publications table
trials_table = pn.pane.DataFrame(pd.DataFrame(), index=False, render_links=True,
                                sizing_mode="stretch_both")


# In[10]:


def callback(target, event):
    target.object = 'Search in progress...'
    df = get_data(event.new.strip())

    fig = px.line(df.groupby(['year', 'is_trial'], as_index=False).title.count(), 
                  x="year", y="title", color='is_trial',
                  labels={'title': 'Citations', 'year': 'Year'})
    citation_years.object = fig
    # df[~pd.isna(df.pmid)]
    
    trials_table.object = df[df.is_trial==True].drop(columns=['pmid', 'is_trial'])
    target.object = 'Done'
    
input_doi.link(output_status, callbacks={'value': callback});


# In[11]:


template = pn.template.BootstrapTemplate(
    title='Is my research used in clinical trials?'
)
template.main.append(
    pn.Row(
        pn.Column(
            input_doi,
            output_status,
            citation_years
        ),
        pn.Column(
            pn.pane.Markdown('## Clinical Trials:'),
            #trials_pie,
            trials_table
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