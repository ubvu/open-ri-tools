[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

# Open RI tools: discover the impact of your research

*Open RI (Research Intelligence) tools are web-applications for researchers that can help with questions regarding research metadata, such as "is my research cited in clinical trials?".*

Commercial applications offer these insights as well, but they are usually closed systems, contradicting the premise of open science.
We use open databases such as [OpenAlex](https://openalex.org/) to offer an alternative platform, involving researchers in the development process. Want to [contribute?](#ideas-and-suggestions).

## Try it out yourself!

All tools are created with [Panel](https://panel.holoviz.org/) and other tools within the [HoloViz](https://holoviz.org/) ecosystem.

There are two ways to run the tools in your browser:
- as static websites (client-side, no server)
- as hosted web applications (server-side)

Before using the applications, read our [disclaimer](#disclaimer).

Then follow the links in the table below, not all applications are currently available:

| Tool | Application | Website |
| -------- | ------- | ------- |
| Citations in clinical trials | [No](https://open-ri-tools-42fcc89e2d28.herokuapp.com/) | [Yes](https://ubvu.github.io/open-ri-tools/clinical_trials.html) |
| Collaboration with global south | [No](https://open-ri-tools2-8ff4ed866ade.herokuapp.com/) | [Yes](https://ubvu.github.io/open-ri-tools/global_south.html) |
| Coauthor network | [No](https://open-ri-tools3-39de28a0be8f.herokuapp.com/) | No |

The coauthor network tool is currently unavailable. 
This is a demonstration of a search followed by an investigation of the network:

<img src="resources/coauthor-network.gif" alt="coauthor network" width="600"/>

<!--
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/ubvu/open-ri-tools/mybinder?urlpath=/panel/)
-->

For the static websites, we use Progressive Web Apps which allows you to install each application on your computer.\
e.g. follow the instructions for [Chrome](https://support.google.com/chrome/answer/9658361).

## Ideas and suggestions?

Whether you are a researcher with ideas for (new) tools or a developer with improvement suggestions, please let us know by creating an [issue](https://github.com/ubvu/open-ri-tools/issues). 
If you would like to contribute by writing code yourself, awesome, follow this [guide](CONTRIBUTING.md).

## Disclaimer

**Data quality**

We rely on external data sources which means that we cannot guarantee accuracy and completeness. 
Therefore, we recommend using the information provided by our applications as merely an indication and not a single source of truth. 

**Availability**

Websites
- this deployment uses [Pyodide](https://pyodide.org/en/stable/)
- be patient: every time an app/page is loaded, Python and all dependencies are fetched and installed 

Hosted web applications (currently not supported)
- availability is limited: all applications share 1000 hours/month
- eco: if an app hasn't been used in the last 30 mins, it goes to sleep and needs some time to start up
- the server isn't able to handle many users simultaneously so it might occasionally slow down
