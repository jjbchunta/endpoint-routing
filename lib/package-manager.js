class EndpointRoutingPackageManager {
    push(group, key, value) {
        this.packages ||= {};
        this.packages[group] ||= {};
        if (this.packages[group].hasOwnProperty[key]) {
            return false;
        }
        this.packages[group][key] = value;
        return true;
    }

    get(group) {
        this.packages ||= {};
        return this.packages[group] || {};
    }
}
const endpointRoutingPackageManager = new EndpointRoutingPackageManager();
export default endpointRoutingPackageManager;