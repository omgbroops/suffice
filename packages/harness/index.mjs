// Shared entry point; the existing tested implementation remains canonical.
export {createSufficeSession} from '../cli/src/session.mjs';
export {parseOptions, VERSION} from '../cli/src/options.mjs';
export {createSufficeModelRuntime, modelRuntimeOptions, refreshModelCatalog} from '../cli/src/model-runtime.mjs';
export {resolveProject, recentProjects, rememberProject} from '../cli/src/projects.mjs';
export {installationId} from '../cli/src/installation-id.mjs';
export {hash} from '../cli/src/workspace.mjs';
