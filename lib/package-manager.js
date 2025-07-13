/**
 * The handler managing various dynamically loaded packages accessable by the codebase.
 */
class EndpointRoutingPackageManager {
    /**
     * Append a new package entry to a specific group.
     * 
     * @param {String} group The group we want to append our entry to.
     * @param {String} key The key associated with this group's entry. Duplicate keys will be ignored.
     * @param {*} value The value we wish to associated with this group's key's entry.
     * @returns {Boolean} True if successfully added, false if there was a naming conflict.
     */
    push(group, key, value) {
        this.packages ||= {};
        this.packages[group] ||= {};
        if (this.packages[group].hasOwnProperty[key]) {
            return false;
        }
        this.packages[group][key] = value;
        return true;
    }

    /**
     * Retrieve all of the entries associated with a specific group.
     * 
     * @param {String} group The group we're reading from.
     * @returns {Object} An collection of all of the keyed entries associated with the requested group.
     */
    get(group) {
        this.packages ||= {};
        return this.packages[group] || {};
    }
}

/**
 * The handler managing various dynamically loaded packages accessable by the codebase.
 */
const endpointRoutingPackageManager = new EndpointRoutingPackageManager();
export default endpointRoutingPackageManager;