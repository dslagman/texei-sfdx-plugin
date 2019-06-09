import { flags, SfdxCommand } from '@salesforce/command';
import { JsonArray, JsonMap } from '@salesforce/ts-types';
import { Messages, SfdxProjectJson, SfdxError } from '@salesforce/core';
import * as fs from 'fs';
import * as path from 'path';

const util = require('util');
const xml2js = require('xml2js');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('texei-sfdx-plugin', 'profile-clean');

const defaultProfileFolder = 'force-app/main/default/profiles';

export default class Clean extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
    '$ texei:profile:clean -u MyScratchOrg -k layoutAssignments,profileActionOverrides',
    '$ texei:profile:clean -u MyScratchOrg -p custom-sfdx-source-folder/main/profiles',
    '$ texei:profile:clean -p custom-sfdx-source-folder/main/profiles,source-folder-2/main/profiles/myAdmin.profile-meta.xml'
  ];

  protected static flagsConfig = {
    keep: flags.string({ char: 'k', required: false, description: 'comma-separated list of profile node permissions that need to be kept. Default: layoutAssignments' }),
    path: flags.string({ char: 'p', required: false, description: 'comma-separated list of profiles, or path to profiles folder. Default: default package directory' })
  };

  // Comment this out if your command does not require an org username
  protected static requiresUsername = false;

  // Comment this out if your command does not require a hub org username
  protected static requiresDevhubUsername = false;

  // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
  protected static requiresProject = false;

  public async run(): Promise<any> {

    let cleanResult = [];

    const nodesToKeep = this.flags.keep ? this.flags.keep : ['layoutAssignments'];
    let profilesToClean = [];

    // Get profiles files path
    if (this.flags.path) {
      // If path was provided as a flag use it/them
      const paths = this.flags.path.split(',');
      console.log('PATHS: ', paths);

      for (const currentPath of paths) {

        if (currentPath.endsWith('.profile-meta.xml')) {
          // Well, this should be a profile
          // Otherwise you have a weird folder naming convention, you should probably stop this

        }
      }

    }
    else {
      // Else look at the default package directory in sfdx-project.json
      const options = SfdxProjectJson.getDefaultOptions();
      const project = await SfdxProjectJson.create(options);
      const packageDirectories = project.get('packageDirectories') as JsonArray || [];
      
      for (let packageDirectory of packageDirectories) {
        packageDirectory = packageDirectory as JsonMap;

        if (packageDirectory.path && packageDirectory.default) {
          
          const dirPath = path.join(
            packageDirectory.path as string,
            'main',
            'default',
            'profiles'
          );

          profilesToClean = await this.getProfilesInPath(dirPath);
          break;
        }
      }

      // If none of these can be found, use the default force-app/main/default/profiles folder
      if (profilesToClean.length == 0) {
        profilesToClean = await this.getProfilesInPath(defaultProfileFolder);   
      }
    }

    if (profilesToClean.length == 0) {
      this.ux.log('No Profile found :(');
    }

    // Promisify functions
    const readFile = util.promisify(fs.readFile);
    
    for (const profilePath of profilesToClean) {

      // Generate path
      const filePath = path.join(
        process.cwd(),
        profilePath
      );

      // Read data file
      const data = await readFile(filePath, 'utf8');

      // Parsing file
      // According to xml2js doc it's better to recreate a parser for each file
      // https://www.npmjs.com/package/xml2js#user-content-parsing-multiple-files
      var parser = new xml2js.Parser();
      const parseString = util.promisify(parser.parseString);
      const profileJson = await parseString(data);
      
      // Removing unwanted nodes
      for (const nodeKey in profileJson.Profile) {
        if (profileJson.Profile.hasOwnProperty(nodeKey)) {
          if (!nodesToKeep.includes(nodeKey)) {
            delete profileJson.Profile[nodeKey];
          }
        }
      }

      // Building back as an xml
      const builder = new xml2js.Builder();
      var xmlFile = builder.buildObject(profileJson);

      // Writing back to file
      await fs.writeFile(filePath, xmlFile, 'utf8', function (err) {
        if (err) {
          throw new SfdxError(`Unable to write Products file at path ${filePath}: ${err}`);
        }
      });

      this.ux.log(`Profile cleaned: ${profilePath}`);
      cleanResult.push(profilePath);
    }

    return { profilesCleaned: cleanResult };
  }

  private async getProfilesInPath(pathToRead: string) {
    let profilesInPath = [];

    const readDirectory = util.promisify(fs.readdir);
    const filesInDir = await readDirectory(pathToRead);

    for (const fileInDir of filesInDir) {

      const dirOrFilePath = path.join(
        process.cwd(),
        pathToRead,
        fileInDir
      );

      // If it's a Profile file, add it
      if (!fs.lstatSync(dirOrFilePath).isDirectory() && fileInDir.endsWith('.profile-meta.xml')) {

        const profileFoundPath = path.join(
          pathToRead,
          fileInDir
        );

        profilesInPath.push(profileFoundPath);
      }
    }
    
    return profilesInPath;
  }

  // TODO: should probably be in a util class
  private async getDefaultPath() {

  }
}