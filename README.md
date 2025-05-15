# MagicMirror² Modules List & Checks

The goals of this project are to **create a nice looking and useful list of modules** for [MagicMirror²](https://magicmirror.builders/) and to **do some rudimentary testing** of the modules (to generate improvement suggestions for the developers).

Feedback and pull requests are very welcome.

## List of modules

[The original list in the wiki](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-party-modules) is a simple text list without filters and images. This list now contains over 1000 modules, so it is not so easy for users to pick out modules.

Based on the original list, we automatically create a website with filter functions and integrated images. You can check it out here: <https://modules.magicmirror.builders/>

### How do I get my module presented in the new list?

Add your module to [the original list in the wiki](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-party-modules). Once a day the new list will be updated based on the original list.

### How do I get my module presented perfectly in the new list?

This is a list of information that we can display on the web page and where the information comes from. This should help you to improve the presentation of your module. Keep in mind that the web page will not be updated immediately, it may take a few days for your changes to arrive.

- Module name: Is taken from the repository URL. Example URL: <https://github.com/maintainer/MMM-MyFancyModule> -> module name `MMM-MyFancyModule`.
- Maintainer: Is also taken from the repository URL. Example URL: <https://github.com/BruceWayne/MMM-MyFancyModule> -> maintainer `BruceWayne`.
- Last commit: It's taken directly from the repository.
- Image
  - There are two requirements for an image of your module to be displayed:
    1. There must be a LICENSE file with a free license or in the `package.json` must be a free license in the license field. Take a look at [this package.json](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/blob/main/package.json) as an example.
    2. There must be an image file in your repository.
  - If there are several images in your repository, one image is selected according to the following logic: First search for an image that contains 'screenshot' or 'example' in it's name and if none is found, take the first image that is found.
- Description: Is taken from the [official list of modules](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-party-modules).
- Tags: Are taken from the keywords in the `package.json`. Take a look at [this package.json](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/blob/main/package.json) as an example.
- License: Is taken from the keywords in the `package.json`. Take a look at [this package.json](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/blob/main/package.json) as an example.

Also check the [result file](./docs/result.md) to see if there are any notes on your module.

## Module tests

The aim of the tests is to increase the quality of the modules, also in order to be able to present them optimally in the module list. Due to the huge number of modules, the tests can only remain rudimentary.

If you have ideas for further tests, you are welcome to create an issue or pull request. And if you as a developer do not like a test, you are welcome to give feedback or simply ignore the result.

The results of the tests you can see in the [`result.html`](https://modules.magicmirror.builders/result.html).

Here are some test results:

- _No image found._ - That means we will not have an image on the web page for this module.
- _package.json issue: No license field._ - No license field means no image on the web page (we can not use images without proper license).
- _package.json issue: license should be a valid SPDX license expression_ - Incorrectly spelled license name means no image on the web page.
- _There is no `package.json`. We need this file to gather information about the module._ - We need information like the license and keywords.
- _Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`._
- _Deprecated: Found 'omxplayer' in file `node_helper.js`: Try to replace it with `vlc`._
- _Recommendation: Found 'node-fetch' in file `node_helper.js`: Replace it with built-in fetch._
- _Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module._
- _Typo: Found 'MagicMirror2' in file `README.md`: Replace it with `MagicMirror²`._
- _Recommendation: Found 'uses: actions/checkout@v3' in file `nodejs.yml`: Replace it with v4._
- _Deprecated: Found 'node-version: [16' in file `nodejs.yml`: Update to current version._
- _Issue: The license in the package.json (ISC) doesn't match the license file (MIT)._

## Prerequisites

For running the scripts and developing you need:

- [Python](https://www.python.org)
- [node.js](https://nodejs.org)

## Installation

1. Clone this repository:
   `git clone https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules`
2. Change into the created directory:
   `cd MagicMirror-3rd-Party-Modules`
3. Install dependencies:
   `npm install`

## Scripts

With `npm start` you can call up a cli menu that offers you options for execution.

You can run all scripts in the right order by `node --run all`.

_Note_: Running all scripts requires a lot of time (> 10 min) and space on your hard drive (> 2 GB).

### create_module_list.js

This script reads the GitHub info of the modules from the respective GitHub repo and writes it to a json file.

### updateGitHubApiData.js

This script reads data, such as the number of stars, via the GitHub API for a few modules.

### get_modules.py

This script reads the module list (created by the script before) and clones all modules.

_Note_: This script takes a long time (> 10 min) to download all modules and also takes up a lot of space on your hard drive (> 2 GB).

### expand_module_list_with_repo_data.js

This script expands the module list with information from the `package.json` files from the modules (if available).

The script also adds an image. To do this, it searches the module's repo for an image that contains "screenshot" or "example" in it's name. If it doesn't find anything like that, it takes the first image it finds in the repo.

_Note_: Images will only be included if a free license is specified in the `package.json`.

### check_modules_js.js

This script does some additional checks on the modules like if the main js file is named correctly or minified.

### check_modules.py

This script goes through all cloned modules and performs various checks. The result is written to the files [`result.html`](https://modules.magicmirror.builders/result.html) and [`modules.json`](./docs/data/modules.json).

### Special script: create_own_module_list.js

This script is for developers who want to test their own modules themselves. It can also be used to test other branches.

This script replaces the first script `create_module_list.js` for this case.

How can you use it?

1. Write the module or modules you want to test in a new file [`ownModuleList.json`](ownModuleList.json) (use `ownModuleList_sample.json` as template). The only obligatory field is "url", but you can also enter a "branch".
2. Execute `node --run ownList`.
3. You can see the result in [`result.html`](https://modules.magicmirror.builders/result.html).

## Ideas / To do

- Long-term goal: The website functions like an app store. The user only has to click on an install button and the module is installed and a basic configuration is inserted.
- Move ideas/todos to GitHub Issues and add proper tags.
- `package.json` is handled in different scripts. This could be done in one.
- Show results in popup on the page.
- Compatibility with:
  - the module list of `MMM-Remote-Control`: <https://github.com/Jopyth/MMM-Remote-Control/blob/master/modules.json> / `MMM-Remote-Control-Repository` <https://github.com/MMRIZE/MMM-Remote-Control-Repository>
  - and mmpm <https://github.com/Bee-Mar/mmpm>
- optimize progress information while running `node --run all`
- Also run the tests on MagicMirror² core?
- Tests
  - Is repository reachable? Now the get_modules script interrupts if a repo isn't reachable.
  - If a module isn't marked as outdated, but has no commits since years: Check if the module is set to archived on GitHub/GitLab.
  - Is depandabot there?
    - Is it set to monthly?
    - Only production?
- rewrite the scripts in rust (it could be faster and a good practice)
- extend the package.json in modules to collect more additional information (based on a [proposal from MMRIZE](https://forum.magicmirror.builders/topic/18092/automatic-checking-of-all-magicmirror-modules/45?_=1702858630364))

  ```json
    "MagicMirror": {
      "screenshot": {
        "license": "MIT",
        "url": "https://somewhere.com/screenshot.png"
      },
      "required": {
        "mm": "2.25",
        "node": "18.0",
        "ApiKey": true
      },
      "notice" : [
        "This will not work in Windows.",
        "Pre-dependency required. Please read README."
      ]
  }
  ```

### Templates for the creation of issues

- Missing keywords: <https://github.com/BrianHepler/MMM-BirdNET/issues/6>
- Missing `package.json`: <https://github.com/elliefairholm/on-this-day/issues/10>
- Missing license file: <https://github.com/grabenhenrich/MMM-Space/issues/1>
- Missing screenshot: <https://github.com/randomBrainstormer/MMM-GoogleCalendar/issues/60>
- Move screenshot to repository: <https://github.com/joschi27/MMM-flatastic/issues/3>
- Reference to the check results: <https://github.com/Fabrizz/MMM-OnSpotify/issues/48>

### Discarded ideas

- New test: Is `moment` in use? <https://momentjs.com/docs/#/-project-status/>.
  - `moment` is not really dead yet (it is no longer being developed, but it is still being maintained), so there is no urgent reason to change now. This is a test for the future when the Temporal API is ready.
- Use data from GitHub API: <https://api.github.com/repos/MagicMirrorOrg/MagicMirror>
  - Is there also a GitLab API? Yes, example: <https://gitlab.com/khassel/MMM-RepoStats/-/blob/master/node_helper.js?ref_type=heads#L116>
  - Unfortunately, the queries are blocked relatively quickly when we query information from each module via the API.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
