#!/usr/bin/env node

import * as fs from 'fs';

import "./lib/preImportShims.js";

import constants from "../src/js/constants.js";

/**
 * A rule for ensuring EFF's DNT policy check requests/responses are allowed.
 */
function make_dnt_policy_rule() {
  let rules = [
    // allow DNT policy check requests even when their domains would be blocked otherwise
    {
      id: 1,
      priority: constants.DNR_DNT_CHECK_ALLOW,
      action: {
        type: 'allow'
      },
      condition: {
        resourceTypes: ['xmlhttprequest'],
        urlFilter: "|https://*/.well-known/dnt-policy.txt|"
      }
    },
  ];

  return rules;
}

/**
 * Rules for sending DNT/GPC headers.
 */
function make_dnt_signal_rules() {
  return [
    // set DNT and Sec-GPC on top-level documents
    {
      id: 1,
      priority: constants.DNR_DNT_HEADER,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{
          header: 'DNT',
          operation: 'set',
          value: '1'
        }, {
          header: 'Sec-GPC',
          operation: 'set',
          value: '1'
        }]
      },
      // all URLs
      condition: {
        resourceTypes: ['main_frame']
      }
    },
    // set DNT and Sec-GPC on all other resource types
    {
      id: 2,
      priority: constants.DNR_DNT_HEADER,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{
          header: 'DNT',
          operation: 'set',
          value: '1'
        }, {
          header: 'Sec-GPC',
          operation: 'set',
          value: '1'
        }]
      },
      // all URLs excluding main_frame resources
      condition: {}
    }
  ];
}

function make_gen204_block_rules(googleHosts) {
  let rules = [],
    id = 1;

  for (let host of googleHosts) {
    rules.push({
      id,
      priority: 1,
      action: { type: 'block' },
      condition: {
        resourceTypes: ['ping'],
        urlFilter: `|https://${host}/gen_204^`
      }
    });
    id++;
  }

  return rules;
}

function make_google_redirect_rules(googleHosts) {
  let rules = [],
    id = 1;

  for (let host of googleHosts) {
    for (let param of ['.+&q', 'q', '.+&url', 'url']) {
      rules.push({
        id,
        priority: 1,
        action: {
          type: "redirect",
          redirect: {
            regexSubstitution: "\\1"
          }
        },
        condition: {
          regexFilter: `^https://${host.replace(/\//g, '\\/')}/url\\?${param}=(https?://[^&]+).*$`,
          resourceTypes: [
            "main_frame"
          ]
        }
      });
      id++;
    }
    // TODO workaround for https://github.com/w3c/webextensions/issues/302
    rules.push({
      id,
      priority: 2,
      action: { type: "allow" },
      condition: {
        urlFilter: `|https://${host}/url?*%*|`,
        resourceTypes: [
          "main_frame"
        ]
      }
    });
    id++;
  }

  return rules;
}

function main() {
  let dntSignalRules = make_dnt_signal_rules();
  fs.writeFileSync("src/data/dnr/dnt_signal.json",
    JSON.stringify(dntSignalRules, null, 2), 'utf8');
  console.log(`Generated ${dntSignalRules.length} DNT signal rules`);

  let dntPolicyRule = make_dnt_policy_rule();
  fs.writeFileSync("src/data/dnr/dnt_policy.json",
    JSON.stringify(dntPolicyRule, null, 2), 'utf8');
  console.log(`Generated 1 EFF's DNT policy rule`);

  let manifestJson = JSON.parse(fs.readFileSync("src/manifest.json", 'utf8'));
  let googleHosts = manifestJson.content_scripts
    .find(i => i.js.includes("js/firstparties/google.js"))
    .matches.filter(i => i.startsWith("https://www.") && i.endsWith("/*"))
    .map(i => i.slice(8).slice(0, -2));

  // generate rules to block Google gen204 beacons
  let gen204Rules = make_gen204_block_rules(googleHosts);
  fs.writeFileSync("src/data/dnr/gen204.json",
    JSON.stringify(gen204Rules, null, 2), 'utf8');
  console.log(`Generated ${gen204Rules.length} Google gen204 beacon block rules`);

  // generate rules to bypass Google redirects
  let googleRedirectRules = make_google_redirect_rules(googleHosts);
  fs.writeFileSync("src/data/dnr/bypass_redirects.json",
    JSON.stringify(googleRedirectRules, null, 2), 'utf8');
  console.log(`Generated ${googleRedirectRules.length} Google redirect rules`);
}

main();