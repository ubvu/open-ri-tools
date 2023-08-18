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
  const env_spec = ['https://cdn.holoviz.org/panel/1.2.1/dist/wheels/bokeh-3.2.2-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.2.1/dist/wheels/panel-1.2.1-py3-none-any.whl', 'pyodide-http==0.2.1', 'hvplot', 'networkx', 'pandas', 'pyalex', 'requests']
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

import hvplot.networkx as hvnx
import networkx as nx

pn.extension('tabulator', 'plotly')


# ## Backend

# ### Find author (autocomplete)

# In[ ]:


def suggest_authors(name_part):

    url_author_ac = 'https://api.openalex.org/autocomplete/authors'
    params = {'q': name_part}
    
    r = requests.get(url_author_ac, params=params)
    if r.status_code == 200:
        return pd.DataFrame(r.json()['results'])
    else:
        return pd.DataFrame()


# ### Find coauthors / create network

# In[ ]:


def fetch_works(author_ids, fields):
    works = []
    works_pages = Works().filter(author={"id": '|'.join(author_ids)}).select(fields).paginate(per_page=200)
    for works_page in works_pages:
        works.extend(works_page)
    return works


def coauthor_net(works, author_ids, author_name, depth=1, edges=None, labels=None):
    '''
    author_ids: only the first is used as node id
    TODO depth=2: coauthors of coauthors
    '''

    # default arguments are evaluated at def i.e. lists will be re-used in each call
    # use None instead, create list at runtime
    if edges is None:
        edges = []
    if labels is None:
        labels = {}
    
    # add name for self
    # for recursive calls: we've already added it 
    if author_ids[0] not in labels:
        labels[author_ids[0]] = author_name
    
    coauthor_ids = set()  # for recursive calls
    for work in works:
        for authorship in work['authorships']:
            aid = authorship['author'].get('id')
            if aid not in author_ids:  # don't add self reference
                coauthor_ids.add(aid)
                name = authorship['author'].get('display_name')
                if name:  # without a name, don't include in network
                    edges.append({'n1': author_ids[0], 'n2': aid, 'type': 'works_with'})
                    if aid not in labels:
                        labels[aid] = name
            else:  # only add affiliation
                aid = author_ids[0]
                name = author_name
            if name:
                # institutes
                for institute in authorship['institutions']:
                    iid = institute.get('id')
                    iname = institute.get('display_name')
                    if iid and iname:
                        edges.append({'n1': aid, 'n2': iid, 'type': 'works_at'})
                        if iid not in labels:
                            labels[iid] = iname

    #if depth > 1:
    #    for aid in coauthor_ids:
    #        coauthor_net(works, [aid], labels[aid], depth-1, edges, labels)

    return pd.DataFrame(edges), labels


def extract_affiliations(edges, author_ids):
    e_prim = edges.copy()[(edges.type=='works_at') & (edges.n1 == author_ids[0])]  # primary affiliations
    # connect co-author affiliations to main author (secondary affiliations)
    e_scnd =  edges.copy()[(edges.type=='works_at') & (edges.n1 != author_ids[0])]
    e_scnd['type'] = 'related_to'
    e_scnd['n1'] = author_ids[0]
    # primary over secondary
    e_scnd = e_scnd[~e_scnd.n2.isin(e_prim.n2)]
    return pd.concat([e_prim, e_scnd], axis=0).drop_duplicates()


# ## Create network widget

# In[ ]:


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

    
def network_widget(edges: pd.DataFrame, labels=None):

    # create graph
    
    if not edges.empty:
        G = nx.from_pandas_edgelist(edges, 'n1', 'n2', 'type')
    else:
        G = nx.petersen_graph()  
    pos = nx.spring_layout(G)

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


# In[ ]:


# test
#aids = ['https://openalex.org/A5028049278']
#anames = ['Ruben Lacroix']
#edges, labels = coauthor_net(fetch_works(aids, ['authorships']), aids, anames)


# In[ ]:


#extract_affiliations(edges, aids)


# In[ ]:


#pn.panel(network_widget(edges, labels), width=800, height=800).servable()
#pn.panel(network_widget([]), width=800, height=800).servable()


# ## Components 

# In[ ]:


autocomplete = pn.widgets.TextInput(placeholder='Author name (press Enter to autocomplete)')


# In[ ]:


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


# In[ ]:


# button to trigger co-author search
start_button = pn.widgets.Button(name='Create network', button_type='primary')

# list to persist fetched works
works_pane = pn.pane.JSON('[]')
author_ids_pane = pn.pane.JSON('[]')

# network widget
coauthors = pn.panel(network_widget(pd.DataFrame()),  # init sample graph
                     #width=800, height=800
                     sizing_mode='stretch_both'
                    )

# affiliations-only checkbox
cb_aff = pn.widgets.Checkbox(name='Affiliations only')

def process_selection(event):
    selection = candidates.value.iloc[candidates.selection]
    works = []
    # fetch works only if selection is different
    author_ids = json.loads(author_ids_pane.object)
    if not selection.empty:
        if set(selection.id.to_list()) != set(author_ids):
            author_ids = selection.id.to_list()
            author_ids_pane.object = json.dumps(author_ids)
            works = fetch_works(author_ids, ['authorships'])
            works_pane.object = json.dumps(works)
        else:
            works = json.loads(works_pane.object)
    if len(works) > 0:
        # create network
        edges, labels = coauthor_net(works, author_ids, selection.display_name.to_list()[0])
        # show affiliations only?
        if cb_aff.value:
            edges = extract_affiliations(edges, author_ids)
    else:
        edges = pd.DataFrame(); labels = None
    coauthors.object = network_widget(edges, labels)
    
start_button.on_click(process_selection);


# In[ ]:


template = pn.template.BootstrapTemplate(
    title='What is my coauthor network?'
)
template.sidebar.append(
    pn.Column(
            autocomplete, 
            start_button,
            candidates,
            cb_aff
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