#!/bin/bash

set -x

while read line; do 
	appname=$(echo $line | cut -f 2 -d ',')
	appcode=$(echo $line | cut -f 3 -d ',')
	appurl=$(echo "${appname}-${appcode}.herokuapp.com")
	# add necessary buildpacks
 	heroku buildpacks:set heroku/python -a $appname
 	heroku buildpacks:add -a $appname heroku-community/multi-procfile
	# reference procfile location
 	heroku config:set -a $appname PROCFILE=procfiles/$appname-${appcode}/Procfile
	# reset repo
 	heroku repo:reset -a $appname
 	# push to heroku
	giturl=$(echo "https://git.heroku.com/${appname}.git") 
	git push $giturl heroku:main
done < deployments
