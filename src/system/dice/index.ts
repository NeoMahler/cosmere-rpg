import { Attribute } from '@system/types/cosmere';
import { AdvantageMode } from '@system/types/roll';
import { CosmereHooks } from '@system/types/hooks';

import './modifiers';
import { D20Roll, D20RollOptions, D20RollData } from './d20-roll';
import { DamageRoll, DamageRollOptions, DamageRollData } from './damage-roll';

// Utils
import {
    determineConfigurationMode,
    getFormulaDisplayString,
} from '@system/utils/generic';

// Constants
import { HOOKS } from '@system/constants/hooks';

export * from './d20-roll';
export * from './damage-roll';
export * from './plot-die';

export interface D20RollConfigration extends D20RollOptions {
    /**
     * The dice roll component parts, excluding the initial d20
     * @default []
     */
    parts?: string[];

    /**
     * Data that will be used when parsing this roll
     * @default {}
     */
    data: D20RollData;

    /**
     * Whether or not to show the roll configuration dialog
     * @default true
     */
    configurable?: boolean;

    /* -- Chat message -- */

    /**
     * Should a chat message be created for this roll?
     * @default true
     */
    chatMessage?: boolean;

    /* -- Roll configuration dialog -- */

    /**
     * HTML template used to display the roll configuration dialog
     */
    template?: string;

    /**
     * Title of the roll configuration dialog
     */
    title: string;

    /**
     * The attribute that is used for the roll by default
     */
    defaultAttribute?: Attribute;

    messageData?: object;
}

export interface DamageRollConfiguration extends DamageRollOptions {
    /**
     * The damage formula to use for this roll
     */
    formula: string;

    /**
     * Data that will be used when parsing this roll
     */
    data: DamageRollData;
}

export async function d20Roll(
    config: D20RollConfigration,
): Promise<D20Roll | null> {
    // Handle key modifiers
    const { fastForward, advantageMode, plotDie } = determineConfigurationMode(
        config.configurable,
        config.advantageMode
            ? config.advantageMode === AdvantageMode.Advantage
            : undefined,
        config.advantageMode
            ? config.advantageMode === AdvantageMode.Disadvantage
            : undefined,
        config.plotDie,
    );

    // Replace config values with key modified values
    config.advantageMode = advantageMode;
    config.plotDie = plotDie;

    // Construct the roll
    const roll = new D20Roll(
        getFormulaDisplayString(['1d20'].concat(config.parts ?? [])),
        config.data,
        { ...config },
    );

    /**
     * Hook: preRoll
     */
    if (
        Hooks.call<CosmereHooks.PreRoll>(
            HOOKS.PRE_ROLL(config.data.context),
            roll, // Roll object
            config.data.source, // Source
            config, // Options
        ) === false
    )
        return null;

    if (!fastForward) {
        /**
         * Hook: preRollConfiguration
         */
        if (
            Hooks.call<CosmereHooks.PreRollConfiguration>(
                HOOKS.PRE_ROLL_CONFIGURATION(config.data.context),
                config, // Config
                config.data.source, // Source
            ) === false
        )
            return null;

        // Prompt dialog to configure the d20 roll
        const configured =
            config.configurable !== false
                ? await roll.configureDialog({
                      title: config.title,
                      raiseStakes: config.plotDie,
                      defaultRollMode:
                          config.rollMode ??
                          game.settings!.get('core', 'rollMode'),
                      defaultAttribute:
                          config.defaultAttribute ??
                          config.data.skill.attribute,
                      skillTest: {
                          data: config.data,
                          parts: [],
                      },
                      plotDie: {},
                  })
                : roll;

        /**
         * Hook: rollConfiguration
         */
        Hooks.callAll<CosmereHooks.RollConfiguration>(
            HOOKS.ROLL_CONFIGURATION(config.data.context),
            config, // Config
            config.data.source, // Source
        );

        if (configured === null) return null;
    }

    // Evaluate the configure roll
    await roll.evaluate();

    /**
     * Hook: roll
     */
    Hooks.callAll<CosmereHooks.Roll>(
        HOOKS.ROLL(config.data.context),
        roll, // Roll object
        config.data.source, // Source
        config, // Options
    );

    if (roll && config.chatMessage !== false) {
        await roll.toMessage(config.messageData, config);
    }

    return roll;
}

export async function damageRoll(
    config: DamageRollConfiguration,
): Promise<DamageRoll> {
    // Construct roll
    const roll = new DamageRoll(config.formula, config.data, {
        damageType: config.damageType,
        mod: config.mod,
        advantageMode: config.advantageMode,
        allowStrings: config.allowStrings,
        maximize: config.maximize,
        minimize: config.minimize,
        damageSourceName: config.damageSourceName,
        critical: config.critical,
    });

    /**
     * Hook: preDamageRoll
     */
    // Note: this setup doesn't allow for early exits from hook listeners,
    // in order to not modify the function signature and not jeopardize
    // the results with additional side effects.
    Hooks.callAll<CosmereHooks.PreDamageRoll>(
        HOOKS.PRE_DAMAGE_ROLL,
        roll, // Roll object
        config.data.source, // Source
        config, // Options
    );

    // Evaluate the roll
    await roll.evaluate();

    /**
     * Hook: damageRoll
     */
    Hooks.callAll<CosmereHooks.DamageRoll>(
        HOOKS.DAMAGE_ROLL,
        roll, // Roll object
        config.data.source, // Source
        config, // Options
    );

    // Return result
    return roll;
}
