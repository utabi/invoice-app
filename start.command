#!/bin/sh
echo 'PARAM:' $0
RELATIVE_DIR=`dirname "$0"`
echo 'Dir:' $RELATIVE_DIR

cd $RELATIVE_DIR/src

npm run start