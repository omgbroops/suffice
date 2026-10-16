export function shouldEscalate({failedValidations,turns,editVersion}){return failedValidations>=2||(turns>=9&&editVersion===0);}
