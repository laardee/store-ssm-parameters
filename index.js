'use strict';

const yaml = require('js-yaml');
const fs = require('fs');
const _ = require('lodash');
const AWS = require('aws-sdk');
const path = require('path');
const args = require('yargs').argv;
const Queue = require('promise-queue');

const maxConcurrent = 1;
const maxQueue = Infinity;
const queue = new Queue(maxConcurrent, maxQueue);

const ssm = new AWS.SSM();

const argsPath = _.first(args._) || args.path;
if (_.isEmpty(argsPath) || _.isUndefined(argsPath)) {
  console.log('Usage: store-ssm-parameters my-config-file.yaml');
  process.exit(0);
}

const normalizedPath = path.normalize(argsPath);
const delay = args.delay || 1;

function createPaths(object, pathPart = '') {
  return _.flattenDeep(
    _.map(object, (value, key) => {
      const keyPath = `${pathPart}/${key}`;
      if (_.isObject(value)) {
        if (typeof value.value !== 'undefined' && typeof value.type !== 'undefined') {
          // assume that value it is an SSM object
          return { Name: keyPath, Value: value.value, Type: value.type };
        }
        return createPaths(value, keyPath);
      }
      return { Name: keyPath, Value: value, Type: 'String' };
    })
  );
}

function storeParameter(parameter) {
  return new Promise(resolve => {
    console.log('Store parameter name: "%s" value: "%s" type: "%s"', parameter.Name, parameter.Value, parameter.Type);
    return setTimeout(() => {
      function store() {
        return ssm
          .putParameter(_.assign({ Overwrite: true }, parameter))
          .promise()
          .then(result => {
            console.log('Parameter stored (Version %s)', result.Version);
            return resolve(result);
          });
      }
      return ssm
        .getParameter({ Name: parameter.Name, WithDecryption: true })
        .promise()
        .then(fetchedParameter => {
          const { Version } = fetchedParameter.Parameter;
          if (fetchedParameter.Parameter.Value === parameter.Value) {
            console.log('Parameter exists with same value (Version %s)', Version);
            return resolve({ Version });
          }
          return store();
        })
        .catch(() => {
          return store();
        });
    }, delay);
  });
}

function createCloudFormationTemplate(parameterPaths) {
  return `---
AWSTemplateFormatVersion: "2010-09-09"
Resources:
${parameterPaths.map(parameterPath => `
  ${parameterPath.Name.replace(/\//g, 'Slash').replace(/\-/g, 'Dash')}:
    Type: "AWS::SSM::Parameter"
    Properties:
      Name: "${parameterPath.Name}"
      Type: "${parameterPath.Type}"
      Value: ${parameterPath.Value}
`).join('')}`;
}

function storeParameters(parameters) {
  const parameterPaths = createPaths(parameters);
  if (args.cloudformationTemplate === true) {
    console.log(createCloudFormationTemplate(parameterPaths));
    return Promise.resolve('done');
  }
  return parameterPaths.map(parameter => queue.add(() => storeParameter(parameter)));
}

module.exports = () => {
  try {
    const doc = yaml.safeLoad(fs.readFileSync(normalizedPath, 'utf8'));
    return storeParameters(doc);
  } catch (exception) {
    console.log(exception);
  }
};
