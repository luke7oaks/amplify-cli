import { ServiceQuestionsResult } from '../service-walkthrough-types';
import { verificationBucketName } from './verification-bucket-name';
import { assign, isEmpty } from 'lodash';
import { structureOAuthMetadata } from '../service-walkthroughs/auth-questions';
import { removeDeprecatedProps } from './synthesize-resources';
import { immutableAttributes, safeDefaults } from '../constants';
import { FeatureFlags } from 'amplify-cli-core';

/**
 * Factory function that returns a function that applies default values to a ServiceQuestionsResult request.
 * It does not overwrite existing values in the request.
 *
 * The logic here has been refactored from service-walkthroughs/auth-questions.js and is mostly unchanged
 * @param defaultValuesFilename The filename to fetch defaults from
 * @param projectName The name of the current project (used to generate some default values)
 */
export const getAddAuthDefaultsApplier = (context: any, defaultValuesFilename: string, projectName: string) => async (
  result: ServiceQuestionsResult,
): Promise<ServiceQuestionsResult> => {
  const { functionMap, generalDefaults, roles, getAllDefaults } = await import(`../assets/${defaultValuesFilename}`);
  result = assign(generalDefaults(projectName), result);

  await verificationBucketName(result);

  structureOAuthMetadata(result, context, getAllDefaults, context.amplify); // adds "oauthMetadata" to result

  // Make the usernames for Cognito case-insensitive by default when it is created, if feature flag
  // is enabled.
  if (FeatureFlags.getBoolean('auth.enableCaseInsensitivity')) {
    result.usernameCaseSensitive = false;
  }

  /* merge actual answers object into props object,
   * ensuring that manual entries override defaults */
  return assign(functionMap[result.authSelections](result.resourceName), result, roles);
};

export const getUpdateAuthDefaultsApplier = (context: any, defaultValuesFilename: string, previousResult: ServiceQuestionsResult) => async (
  result: ServiceQuestionsResult,
): Promise<ServiceQuestionsResult> => {
  const { functionMap, getAllDefaults } = await import(`../assets/${defaultValuesFilename}`);
  if (!result.authSelections) {
    result.authSelections = 'identityPoolAndUserPool';
  }

  const defaults = functionMap[result.authSelections](previousResult.resourceName);

  // ensure immutable attributes are removed from result
  immutableAttributes.filter(pv => pv in previousResult).forEach(pv => delete (result as any)[pv]);

  if (['default', 'defaultSocial'].includes(result.useDefault)) {
    safeDefaults.forEach(sd => delete (previousResult as any)[sd]);
  }

  await verificationBucketName(result, previousResult);

  structureOAuthMetadata(result, context, getAllDefaults, context.amplify); // adds "oauthMetadata" to result

  // If there are new trigger selections, make sure they overwrite the previous selections
  if (!isEmpty(result.triggers)) {
    previousResult.triggers = Object.assign({}, result.triggers);
  }
  return assign(defaults, removeDeprecatedProps(previousResult), result);
};
