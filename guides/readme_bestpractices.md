This file contains suggested best practices for creating a README file for your MagicMirror² module.  

# Installation Instructions

Your README file should have an "Installation" section that includes a code block that can be pasted into a user's terminal to fully install your module. Here is a good example of an install code block:

## Example if your module has no dependencies

````
```bash
cd ~/MagicMirror/modules
git clone https://github.com/MyUsername/MMM-MyModule
```
````

## Example if your module has dependencies

````
```bash
cd ~/MagicMirror/modules
git clone https://github.com/MyUsername/MMM-MyModule
cd MMM-MyModule
npm ci --omit=dev
```
````

## Tips

* The code block should not be broken up into multiple separate blocks for each line of code so that users can copy and paste the entire block into their terminal and execute the install with one click.
* The opening `` ``` `` of your code block should be followed by "`sh`" or "`bash`" so that the code block is styled as shell script.
* If your module has required dependencies, `npm ci` is preferable to `npm install` in many circumstances because it will repeatably instruct users' machines not to recreate the `package-lock.json` file.
* Adding `--omit=dev` to the `npm ci` or `npm install` command will instruct users' machines not to install developer dependencies that are unneeded by most users, which will save on install time and disk space.

# Update Instructions

Your README file should have an "Update" section that includes a code block that can be pasted into a user's terminal to update your module.

# Config Instructions

Your README file should have a "Config" or "Configuration" section that includes an example config block that can be pasted into user's `config.js` files.  Here is a good example of a config code block:

````
```js
{
  module: MMM-MyModule,
  position: bottom_bar,
  config: {
    myCustomVariable: 400,
    MySecondCustomVariable: false
  }
},
```
````

## Tips

* The opening `` ``` `` of your code block should be followed by "`js`" or "`javascript`" so that the code block is styled as javasript.
* The final `}` should be followed by a `,` so that the block can be copied and pasted straight into users' `config.js` files without throwing errors.
* The example config should provide a minimal demo configuration that will get your module working if pasted directly into a user's `config.js` file.
