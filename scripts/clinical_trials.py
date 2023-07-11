# ---
# jupyter:
#   jupytext:
#     cell_metadata_filter: -all
#     notebook_metadata_filter: kernel
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.14.7
#   kernelspec:
#     display_name: Python 3 (ipykernel)
#     language: python
#     name: python3
# ---

# %%
# Panel infers Pyodide installs from these imports:
import panel as pn
import pandas as pd
import requests

# necessary to render in notebook
pn.extension('plotly', 'tabulator')


# %% [markdown]
# ## Backend
#
# - Functions for data collection and transformation

# %%
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


# %%
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


# %%
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


# %%
# when starting the application, we want to show a default dashboard using existing data
# uncomment and run this cell to update the default data / push to repo
#df = get_data('10.1136/annrheumdis-2019-216655')  # or: 10.3389/fnsys.2013.00031
#df.to_csv('../data/clinical_trials_default.csv')

# %% [markdown]
# ## Load default data

# %%
df_demo = pd.read_csv('https://raw.githubusercontent.com/ubvu/open-ri-tools/main/data/clinical_trials_default.csv', index_col=0)


# %%
# transformations to the dataframe
# applied when loading or updating data
def transform_df(df):
    #df = df.astype(object)
    return df


# %% [markdown]
# ## Plotting functions

# %%
import plotly.express as px


# %%
def plot_citations(df):
    agg = df.groupby(['year', 'is_trial'], as_index=False).title.count()
    fig = px.bar(agg, x="year", y="title", color='is_trial',
                 labels={'title': 'Citations', 'year': 'Year'},
                 template="simple_white")
    fig.update_xaxes(type='category')  # otherwise, ticks appear when zooming in
    return fig


# %% [markdown]
# ## Components and Interactivity
#
# - create components and bind them

# %%
# main dataframe widget (not displayed), used to bind other components to
# is updated when doi is submitted and processed successfully
df_widget = pn.widgets.DataFrame(transform_df(df_demo), name='df')

# %%
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
    ymin = int(df.year.min())
    ymax = int(df.year.max())
    return {'start': ymin, 'end': ymax, 'value': (ymin, ymax)}  # label=value so it has to be set as well
# year range binds to df via refs argument
slider_year = pn.widgets.IntRangeSlider(refs=pn.bind(year_range, df_widget), **year_range(df_widget.value))  # start/end defaults needed
# add to table
widget_table.add_filter(cb_trial, 'is_trial')
widget_table.add_filter(slider_year, 'year')


# %%
# test
#pane_plot_citations.servable()

# %%
# test
#pn.Row(cb_trial, slider_year, widget_table).servable()

# %%
# test: observe updates when df changes
#df_widget.value = df_demo[df_demo.year==2020]

# %%
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

# %%
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

# %% [markdown]
# ## Layout
#
# - add components to page

# %%
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

# %%
