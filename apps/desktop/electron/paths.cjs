const os=require('node:os');
const path=require('node:path');
// Single source for the app's data root; SUFFICE_HOME lets tests and the harness share a fixture directory.
const sufficeHome=()=>process.env.SUFFICE_HOME||path.join(os.homedir(),'.suffice');
module.exports={sufficeHome};
