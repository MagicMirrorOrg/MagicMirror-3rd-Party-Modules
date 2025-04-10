#!/usr/bin/python3
"""Function to run some checks to all downloaded modules."""

from pathlib import Path
from datetime import datetime, timezone
import json
import subprocess
import deprecation_check
import eslint_checks


def search_in_file(path, search_string):
    """Function to search a string in a file."""
    try:
        with open(path, "r", encoding="utf-8") as file:
            if search_string in file.read():
                return True
    except UnicodeDecodeError:
        pass


def check_modules():
    """Function to search a string in a file."""

    search_strings = {
        "new Buffer(": {
            "name": "This is deprecated. Please update: <https://nodejs.org/api/buffer.html>.",
            "category": "Deprecated",
        },
        "stylelint-config-prettier": {
            "name": "Update `stylelint` and remove `stylelint-config-prettier`.",
            "category": "Deprecated",
        },
        '"eslint-plugin-json"': {
            "name": "Replace it by `eslint-plugin-jsonc`.",
            "category": "Recommendation",
        },
        "Magic Mirror": {
            "name": "Replace it with `MagicMirror²`.",
            "category": "Typo",
        },
        "MagicMirror2": {
            "name": "Replace it with `MagicMirror²`.",
            "category": "Typo",
        },
        "[MagicMirror]": {
            "name": "Replace it with `[MagicMirror²]`.",
            "category": "Typo",
        },
        "<sub>2</sub>": {
            "name": "Replace it with `²`.",
            "category": "Typo"
        },
        'require("request")': {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        "require('request')": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        'require("request-promise")': {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        "require('request-promise')": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        'require("native-request")': {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        "require('native-request')": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        'require("http")': {
            "name": 'Replace "http" by "node:http".',
            "category": "Recommendation",
        },
        "require('http')": {
            "name": "Replace 'http' by 'node:http'.",
            "category": "Recommendation",
        },
        'require("https")': {
            "name": 'Replace "https" by "node:https".',
            "category": "Recommendation",
        },
        "require('https')": {
            "name": "Replace 'https' by 'node:https'.",
            "category": "Recommendation",
        },
        "'node-fetch'": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        '"node-fetch"': {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        'require("fetch")': {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "require('fetch')": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "axios": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        '"needle"': {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "'needle'": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "omxplayer": {
            "name": "Try to replace it with `vlc`.",
            "category": "Deprecated",
            "source": "https://github.com/popcornmix/omxplayer",
        },
        "XMLHttpRequest": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "uses: actions/checkout@v2": {
            "name": "Replace it with v4.",
            "category": "Recommendation",
        },
        "uses: actions/checkout@v3": {
            "name": "Replace it with v4.",
            "category": "Recommendation",
        },
        "uses: actions/setup-node@v3": {
            "name": "Replace it with v4.",
            "category": "Recommendation",
        },
        "node-version: 14": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "node-version: [14": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "node-version: 16": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "node-version: [16": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "github/super-linter@": {
            "name": "Replace it with `github/super-linter/slim@`.",
            "category": "Recommendation",
        },
        "jshint": {
            "name": 'Replace "jshint" by "eslint".',
            "category": "Recommendation",
        },
        "getYear()": {
            "name": "Replace `getYear()` by `getFullYear()`.",
            "category": "Deprecated",
        },
        "MichMich/MagicMirror": {
            "name": "Replace it by `MagicMirrorOrg/MagicMirror`.",
            "category": "Outdated",
        },
        "/_/husky.sh": {
            "name": "Since husky v9 you may not need this anymore.",
            "category": "Outdated",
        },
        "husky install": {
            "name": "Since husky v9 you may not need this anymore.",
            "category": "Outdated",
        },
        "npm i electron-rebuild": {
            "name": "Replace it with `@electron/rebuild`",
            "category": "Deprecated",
        },
        "npm install electron-rebuild": {
            "name": "Replace it with `@electron/rebuild`",
            "category": "Deprecated",
        },
        "api.openweathermap.org/data/2.5": {
            "name": "OpenWeather API 2.5 is deprecated since June 2024. Please update to 3.0.",
            "category": "Deprecated",
        },
        "https://cdnjs.cloudflare.com": {
            "name": "It looks like a package is loaded via CDN. It would be better if the package were installed locally via npm.",
            "category": "Recommendation",
        },
        "https://cdn.jsdelivr.net": {
            "name": "It looks like a package is loaded via CDN. It would be better if the package were installed locally via npm.",
            "category": "Recommendation",
        },
    }

    search_strings_package_json = {
        '"electron-rebuild"': {
            "name": "Replace it with `@electron/rebuild`",
            "category": "Deprecated"
        },
        '"grunt"': {
            "name": "Grunt is practically unmaintained. Move on to something better.",
            "category": "Deprecated",
        },
        'eslint-config-airbnb': {
            "name": "Replace it with modern ESLint configuration.",
            "category": "Deprecated",
        },
        'rollup-plugin-banner': {
            "name": "Replace it with built-in banner.",
            "category": "Deprecated",
        },
    }

    search_strings_package_lock_json = {
        '"lockfileVersion": 1': {
            "name": "Run `npm update` to update to lockfileVersion 3.",
            "category": "Deprecated"
        },
        '"lockfileVersion": 2': {
            "name": "Run `npm update` to update to lockfileVersion 3.",
            "category": "Deprecated"
        },
    }

    modules_json_file = open(
        "./docs/data/modules.stage.4.json", encoding="utf-8")
    modules = json.load(modules_json_file)
    stats = {
        "moduleCounter": 0,
        "modulesWithImageCounter": 0,
        "modulesWithIssuesCounter": 0,
        "issueCounter": 0,
        "lastUpdate": datetime.now().astimezone().replace(microsecond=0).isoformat(),
        "repositoryHoster": {},
        "maintainer": {},
    }

    markdown_output_modules = ""

    for module in modules:
        module["defaultSortWeight"] = 0
        stats["moduleCounter"] += 1

        module_directory = module["name"] + "-----" + module["maintainer"]
        module_directory_path = Path("./modules/" + module_directory)

        # Print progress
        progress = f"{stats['moduleCounter']:4}/{len(modules)}  {module['name']}                        \r"
        print(progress, end="")

        get_last_commit_date(module, module_directory_path)

        if "image" in module:
            stats["modulesWithImageCounter"] += 1

        if "outdated" in module:
            module["defaultSortWeight"] += 900
            # Set this to False to prevent showing dev hints on the website..
            module["issues"] = False
            stats["issueCounter"] += 1
            stats["modulesWithIssuesCounter"] += 1

        else:
            if "isArchived" in module:
                module["defaultSortWeight"] += 800
                stats["issueCounter"] += 1
                module["issues"].append(
                    "Module is archived, but not marked as outdated in the official module list.")

            elif not module["name"].startswith("MMM-") and not module["name"] == "mmpm":
                module["issues"].append(
                    "Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module."
                )

            for file_path in sorted(module_directory_path.rglob("*")):
                if file_path.is_dir():
                    # Explanation for .count("node_modules") == 1: If there is a node_modules directory, there are probably others in it with that name. There does not have to be an additional message for this.
                    if (
                        file_path.name == "node_modules"
                        and str(file_path).count("node_modules") == 1
                    ):
                        module["issues"].append(
                            "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`."
                        )
                elif not file_path.is_symlink() and "node_modules" not in str(file_path):
                    if "package-lock.json" in str(file_path).lower():
                        for search_string, value in search_strings_package_lock_json.items():
                            found_string = search_in_file(file_path, search_string)
                            if found_string:
                                module["issues"].append(
                                    f"{value['category']}: Found `{search_string}` in file `{file_path.name}`: {value['name']}"
                                )
                    elif ("changelog" not in str(file_path).lower()):
                        if file_path.name == "jquery.js" or file_path.name == "jquery.min.js":
                            module["issues"].append(
                                f"Recommendation: Found local copy of `{file_path.name}`. Instead of a local copy, it would be better to add jQuery to the dependencies in `package.json`."
                            )

                            found_string = any(
                                search_in_file(file_path, version)
                                for version in ["jQuery v3.7", "jQuery v3.8", "jQuery v3.9", "jQuery v4"]
                            )
                            if found_string is False:
                                module["issues"].append(
                                    f"Outdated: Local jQuery file `{file_path.name}` seems to be outdated. jQuery v3.7 or higher is recommended."
                                )
                        else:
                            for search_string, value in search_strings.items():
                                found_string = search_in_file(
                                    file_path, search_string)
                                if found_string:
                                    module["issues"].append(
                                        f"{value['category']}: Found `{search_string}` in file `{file_path.name}`: {value['name']}"
                                    )

                            if file_path.name == "package.json":
                                for search_string, value in search_strings_package_json.items():
                                    found_string = search_in_file(
                                        file_path, search_string)
                                    if found_string:
                                        module["issues"].append(
                                            f"{value['category']}: Found `{search_string}` in file `{file_path.name}`: {value['name']}"
                                        )

                            if "stylelint" in file_path.name:
                                search_string = "prettier/prettier"
                                found_string = search_in_file(
                                    file_path, search_string)
                                if found_string:
                                    module["issues"].append(
                                        f"Recommendation: Found `{search_string}` in file `{file_path.name}`: Config would be cleaner using 'stylelint-prettier/recommended'. See (https://github.com/prettier/stylelint-prettier)."
                                    )

                            if file_path.name.startswith("README") and file_path.parent == module_directory_path:
                                # Search for "update" or "Update" in README
                                found_update_string = search_in_file(
                                    file_path, "Update")
                                if not found_update_string:
                                    found_update_string = search_in_file(
                                        file_path, "update")
                                if not found_update_string:
                                    module["issues"].append(
                                        "Recommendation: The README seems not to have an update instruction (the word 'update' is missing). Please add one."
                                    )

                                # Search for "install" in README
                                found_clone_string = search_in_file(
                                    file_path, "Install")
                                if not found_clone_string:
                                    found_clone_string = search_in_file(
                                        file_path, "install")
                                if not found_clone_string:
                                    module["issues"].append(
                                        "Recommendation: The README seems not to have an install instruction (the words 'install' or 'installation' are missing). Please add one."
                                    )

                            if len(module["issues"]) < 1:
                                if ".yml" in str(file_path).lower():
                                    module["issues"].append(
                                        f"Recommendation: `{file_path.name}`: Use official file extension `.yaml` instead of `.yml` (<https://yaml.org/faq.html>).")

            if "LICENSE" not in str(sorted(module_directory_path.rglob("*"))):
                module["issues"].append("Warning: No LICENSE file.")

            if "CHANGELOG" not in str(sorted(module_directory_path.rglob("*"))):
                module["issues"].append("Recommendation: There is no CHANGELOG file. It is recommended to add one.")

            if "CODE_OF_CONDUCT" not in str(sorted(module_directory_path.rglob("*"))):
                module["issues"].append("Recommendation: There is no CODE_OF_CONDUCT file. It is recommended to add one.")

            if "eslintrc" in str(sorted(module_directory_path.rglob("*"))):
                module["issues"].append(
                    "Recommendation: Replace eslintrc by new flat config.")
            elif "eslint.config" not in str(sorted(module_directory_path.rglob("*"))):
                module["issues"].append(
                    "Recommendation: No ESLint configuration was found. ESLint is very helpful, it is worth using it even for small projects.")
            else:
                # Check if ESLint is in the dependencies or devDependencies
                package_json = Path(f"{module_directory_path}/package.json")
                if package_json.is_file():
                    with open(package_json, "r", encoding="utf-8") as file:
                        package_json_content = json.load(file)
                        if "eslint" not in package_json_content.get("dependencies", {}) and "eslint" not in package_json_content.get("devDependencies", {}):
                            module["issues"].append(
                                "Recommendation: ESLint is not in the dependencies or devDependencies. It is recommended to add it to one of them.")
                        # Check if there is a script for ESLint
                        if "scripts" in package_json_content:
                            if "lint" not in package_json_content["scripts"]:
                                module["issues"].append(
                                    "Recommendation: No lint script found in package.json. It is recommended to add one.")
                            elif "eslint" not in package_json_content["scripts"]["lint"]:
                                module["issues"].append(
                                    "Recommendation: The lint script in package.json does not contain `eslint`. It is recommended to add it.")

            if not module_directory_path.is_dir():
                module["issues"] = [
                    "Error: It appears that the repository could not be cloned. Check the URL."
                ]

            check_branch_name(module, module_directory_path)

            check_dependency_updates(module, module_directory_path)

            if len(module["issues"]) > 0:
                stats["modulesWithIssuesCounter"] += 1
                markdown_output_modules += f"\n### [{module['name']} by {module['maintainer']}]({module['url']})\n\n"

                stats["issueCounter"] += len(module["issues"])
                for idx, issue in enumerate(module["issues"]):
                    markdown_output_modules += f"{idx+1}. {issue}\n"

            repository_hoster = module["url"].split(".")[0].split("/")[2]
            if repository_hoster not in stats["repositoryHoster"]:
                stats["repositoryHoster"][repository_hoster] = 1
            else:
                stats["repositoryHoster"][repository_hoster] += 1

            if module["maintainer"] not in stats["maintainer"]:
                stats["maintainer"][module["maintainer"]] = 1
            else:
                stats["maintainer"][module["maintainer"]] += 1

            module["defaultSortWeight"] += len(module["issues"])

            # Replace the issue array with boolean. The issues were written to result.md and for the website is only relevant if the module has issues or not. This reduces the size of modules.json by more than half.
            if len(module["issues"]) > 0:
                module["issues"] = True
            else:
                module["issues"] = False

            # Lift modules with many stars in the default sort order.
            if module.get('stars', 0) > 50:
                module["defaultSortWeight"] = module["defaultSortWeight"] - \
                    (module['stars'] // 50)
            elif module.get('stars', 0) > 10:
                module["defaultSortWeight"] = module["defaultSortWeight"] - 1

            # Modules with few stars shouldn't be too far up in the default sort order. So we give them a minimum value of one.
            elif module.get('stars', 0) < 3:
                module["defaultSortWeight"] = max(
                    module["defaultSortWeight"], 1)

            # Just to reduce imbalance in the default sort order, modules from this developer get a minimum value of one.
            if module['maintainer'] == "KristjanESPERANTO" and module["name"] != "MMM-EasyPix":
                module["defaultSortWeight"] = max(module["defaultSortWeight"], 1)

    print(
        f"{stats['moduleCounter']} modules analyzed. For results see file result.md.           ")

    # Preparing the markdown output
    markdown_output = "# Result of the module analysis\n\n"
    markdown_output += f"Last update: {stats['lastUpdate']}\n\n"
    markdown_output += "## General notes\n\n"
    markdown_output += "* This is an automated analysis of the modules. It is not perfect and can contain errors. If you have any questions or suggestions, please open an issue on GitHub.\n"
    markdown_output += "* Some issues are opinionated recommendations. Please feel free to ignore them.\n\n"
    markdown_output += "## Statistics\n\n"
    markdown_output += "|                      | number   |\n"
    markdown_output += "|:---------------------|:--------:|\n"
    markdown_output += f"| modules analyzed     | {           stats['moduleCounter']:>6}   |\n"
    markdown_output += f"| maintainer           | {         len(stats['maintainer']):>6}   |\n"
    markdown_output += f"| modules with issues  | {stats['modulesWithIssuesCounter']:>6}   |\n"
    markdown_output += f"| issues               | {            stats['issueCounter']:>6}   |\n"

    for hoster, number in stats["repositoryHoster"].items():
        markdown_output += f"| modules at {hoster:9} | {                              number:>6}   |\n"

    markdown_output += "\n## Modules with issues\n"
    markdown_output += markdown_output_modules

    stats["maintainer"] = dict(
        sorted(stats["maintainer"].items(), key=lambda x: x[1], reverse=True)
    )

    # Writing to markdown
    with open("./docs/result.md", "w", encoding="utf-8") as output_file:
        output_file.write(markdown_output)

    # Serializing json
    json_object = json.dumps(modules, indent=2)

    # Writing to modules.json
    with open("./docs/data/modules.json", "w", encoding="utf-8") as outfile:
        outfile.write(json_object)

    # Serializing and minifying json
    json_object = json.dumps(modules)

    # Writing to modules.min.json
    with open("./docs/data/modules.min.json", "w", encoding="utf-8") as outfile:
        outfile.write(json_object)

    # Statistics
    # Serializing json
    statistics_json_object = json.dumps(stats, indent=2)

    # Writing to stats.json
    with open("./docs/data/stats.json", "w", encoding="utf-8") as outfile:
        outfile.write(statistics_json_object)


def get_last_commit_date(module, module_directory_path):
    """Function to get the last commit date."""
    module["lastCommit"] = (
        subprocess.run(
            f"cd {module_directory_path} && git log -1 --format='%aI' && cd .. && cd ..",
            stdout=subprocess.PIPE,
            shell=True,
            check=False,
        )
        .stdout.decode()
        .rstrip()
    )

    # If the last commit is older than two years, we make the module heavier for the default sort order.
    last_commit_date = datetime.strptime(
        module["lastCommit"], '%Y-%m-%dT%H:%M:%S%z')
    current_datetime = datetime.now(timezone.utc)
    if (current_datetime - last_commit_date).days > 365 * 2:
        module["defaultSortWeight"] += 1


def check_dependency_updates(module, module_directory_path):
    """
        Function to check if there are dependency updates.

        Because this is so time-consuming, we only do this for modules with a small number of issues.

        If there are only development updates, no issue will be created. 
    """
    package_json = Path(f"{module_directory_path}/package.json")
    prod_updates_list = []
    if len(module["issues"]) in [2, 3] and package_json.is_file():

        prod_updates_string = (
            subprocess.run(
                f"ncu --cwd {module_directory_path} --dep prod",
                capture_output=True,
                shell=True,
                check=False
            )
            .stdout.decode()
            .rstrip()
        )
        prod_updates_list = prod_updates_string.splitlines()
        prod_updates_list = [
            line for line in prod_updates_string if "→" in line]

    if len(prod_updates_list) > 0 or (len(module["issues"]) in [0, 1] and package_json.is_file()):

        updates_string = (
            subprocess.run(
                f"ncu --cwd {module_directory_path}",
                capture_output=True,
                shell=True,
                check=False
            )
            .stdout.decode()
            .rstrip()
        )
        updates_list = updates_string.splitlines()
        updates_list = [line for line in updates_list if "→" in line]

        if len(updates_list) > 0:
            issue_text = f"Information: There are updates for {len(updates_list)} dependencie(s):\n"
            for update in updates_list:
                issue_text += f"   -{update}\n"
            module["issues"].append(issue_text)

    if len(module["issues"]) in [0, 1] and package_json.is_file():
        deprecation = deprecation_check.check_deprecated_packages(
            module_directory_path)
        if deprecation:
            module["issues"].append(deprecation)

    if len(module["issues"]) in [0, 1] and package_json.is_file():
        eslint_issues = eslint_checks.eslint_check(module_directory_path)
        if eslint_issues:
            eslint_issues_text = "ESLint issues:\n"
            for issue in eslint_issues:
                eslint_issues_text += f"   - {issue}\n"
            module["issues"].append(eslint_issues_text)


def check_branch_name(module, module_directory_path):
    """Function to check the branch name."""
    branch = (
        subprocess.run(
            f"cd {module_directory_path} && git branch && cd .. && cd ..",
            stdout=subprocess.PIPE,
            shell=True,
            check=False,
        )
        .stdout.decode()
        .rstrip()
    )
    # Deactivated because it causes issues for the users. They would have to rename the branch, but they probably don't know how to do it.
    # https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/24
    # if "* master" in branch:
    #    module["issues"].append(
    #        "The branch name is 'master'. Consider renaming it to 'main'.")
    # Instead lift modules with a branch name other than master
    if "master" not in branch:
        module["defaultSortWeight"] -= 1


check_modules()
