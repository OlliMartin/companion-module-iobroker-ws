import { CompanionInputFieldDropdown, DropdownChoice } from '@companion-module/base'

const getNameFromIobObject = (obj: ioBroker.Object): string => {
	try {
		if (!obj.common.name) {
			return obj._id
		}

		if (Object.prototype.hasOwnProperty.call(obj.common.name, 'en')) {
			// @ts-expect-error name is of type 'StringOrTranslated' and the linter is making this annoying.
			return obj.common.name.en
		}
		return obj.common.name as string
	} catch (err) {
		console.log('ERROR: ', obj, err)
		return obj._id
	}
}

function EntityOptions(iobObjects: ioBroker.Object[], prefix: string | undefined): DropdownChoice[] {
	const entities = iobObjects.filter((ent) => prefix === undefined || ent._id.indexOf(`${prefix}.`) === 0)

	return entities
		.map((ent) => ({
			id: ent._id,
			label: `${getNameFromIobObject(ent)} (${ent._id})`,
		}))
		.sort((a, b) => {
			const a2 = a.id.toLowerCase()
			const b2 = b.id.toLowerCase()
			return a2 === b2 ? 0 : a2 < b2 ? -1 : 1
		})
}

/**
 * Creates an input selector (dropdown) over all provided ioBroker objects.
 * @param iobObjects - The ioBroker objects to use
 * @param prefix - Optional. Prefix to filter object ids (full-tree form) for
 */
export function EntityPicker(iobObjects: ioBroker.Object[], prefix: string | undefined): CompanionInputFieldDropdown {
	const choices = EntityOptions(iobObjects, prefix)

	return {
		type: 'dropdown',
		label: 'Entity',
		id: 'entity_id',
		default: choices[0]?.id ?? '',
		choices: choices,
	}
}

/**
 * Creates an input selector (dropdown) over all ioBroker objects that have a `boolean` type and are writeable.
 * @param iobObjects - The ioBroker objects to use
 * @param prefix - Optional. Prefix to filter object ids (full-tree form) for
 */
export function ToggleStatePicker(
	iobObjects: ioBroker.Object[],
	prefix: string | undefined,
): CompanionInputFieldDropdown {
	const toggleableObjects = iobObjects.filter((obj) => obj.common.write && obj.common.type === 'boolean')

	const choices = EntityOptions(toggleableObjects, prefix)

	return {
		type: 'dropdown',
		label: 'Entity',
		id: 'entity_id',
		default: choices[0]?.id ?? '',
		choices: choices,
	}
}
