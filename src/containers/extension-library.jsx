import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        });
    }
    return extension;
};

const translateGalleryItem = (extension, locale) => ({
    ...extension,
    name: extension.nameTranslations[locale] || extension.name,
    description: extension.descriptionTranslations[locale] || extension.description
});


// Curated standalone extensions from Gandi IDE's community extension repository.
// Source: https://github.com/Gandi-IDE/custom-extension/tree/main/extensions
const fetchGandiLibrary = async () => {
    const baseURL = 'https://raw.githubusercontent.com/Gandi-IDE/custom-extension/main/extensions/';
    // Use each extension's real ID. The VM selects the loaded category by this ID.
    const paths = [
        ['Arkos/advancedControls.js', 'Advanced Controls', 'advancedControls', 'Arkos/assets/advanced_control_cover.png'],
        ['Arkos/arkosExtension.js', 'Arkos Extension', 'hcnTest', 'Arkos/assets/cover1.png'],
        ['Arkos/moreSensing.js', 'More Sensing', 'moreSensing', 'Arkos/assets/cover2.png'],
        ['Fath/CocreaFetch.js', 'Cocrea Fetch', 'cocreaFetch', 'Fath/assets/CocreaFetch.png'],
        ['Fath/comment blocks.js', 'Comment Blocks', 'lmscomments', 'Fath/banners/CommentBlocks.png'],
        ['FurryR/lpp.js', 'LPP', 'lpp'],
        ['Project/Project.js', 'Project', 'Project0832.Project0832', 'Project/Project.svg'],
        ['QuakeStudio/BetterQuake/BetterQuake.js', 'BetterQuake', 'BetterQuake', 'QuakeStudio/assets/banner.png'],
        ['dannydev/scCOM.js', 'scCOM', 'DannyDevNet'],
        ['qxsck/data-analysis.js', 'Data Analysis', 'qxsckdataanalysis'],
        ['qxsck/easy-struct.js', 'Easy Struct', 'qxsckeasystruct'],
        ['qxsck/matrix.js', 'Matrix', 'qxsckmatrix'],
        ['qxsck/str-mani.js', 'String Manipulation', 'strmani'],
        ['qxsck/var-and-list.js', 'Variables and Lists', 'qxsckvarandlist'],
        ['six-6/datetime.js', 'DateTime', 'DateTime', 'six-6/DateTimePost.svg'],
        ['six-6/regexp.js', 'RegExp', 'RegExpVI'],
        ['wit_cat/FPS.js', 'FPS', 'WitCatFPS']
    ];

    const getEmbeddedCover = source => {
        // Some community extensions ship their cover as a data URI inside the
        // extension file rather than as a separate image asset.
        const candidates = [
            /(?:const|let|var)\s+(?:cover|banner|_picture|witcat_fps_picture)\s*=\s*(['"])(data:image\/[^'"]+)\1/,
            /(?:const|let|var)\s+(?:icon|Icon|icon_default|insetIcon|_icon|witcat_fps_icon)\s*=\s*(['"])(data:image\/[^'"]+)\1/,
            /iconURL\s*:\s*(['"])(data:image\/[^'"]+)\1/
        ];
        for (const pattern of candidates) {
            const match = source.match(pattern);
            if (match) return match[2];
        }
        return null;
    };

    return Promise.all(paths.map(async ([path, name, extensionId, cover]) => {
        let iconURL = cover ? `${baseURL}${cover.split('/').map(encodeURIComponent).join('/')}` : extensionIcon;
        if (!cover) {
            try {
                const response = await fetch(`${baseURL}${path.split('/').map(encodeURIComponent).join('/')}`);
                if (response.ok) {
                    iconURL = getEmbeddedCover(await response.text()) || extensionIcon;
                }
            } catch (error) {
                // A missing artwork request should not prevent the gallery opening.
            }
        }
        return {
            name,
            extensionId,
            extensionURL: `${baseURL}${path.split('/').map(encodeURIComponent).join('/')}`,
            iconURL,
            description: 'Community extension from Gandi IDE. Compatibility with YASM may vary.',
            tags: ['gandi'],
            featured: true
        };
    }));
};

let cachedGallery = null;

const fetchLibrary = async () => {
    const res = await fetch('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json');
    if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
    }
    const data = await res.json();
    return data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
        iconURL: `https://extensions.turbowarp.org/${extension.image || 'images/unknown.svg'}`,
        tags: ['tw'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => {
            if (credit.link) {
                return (
                    <a
                        href={credit.link}
                        target="_blank"
                        rel="noreferrer"
                        key={credit.name}
                    >
                        {credit.name}
                    </a>
                );
            }
            return credit.name;
        }),
        docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
        samples: extension.samples ? extension.samples.map(sample => ({
            href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
            text: sample
        })) : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: true
    }));
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
        this.state = {
            gallery: cachedGallery,
            gandiGallery: null,
            galleryError: null,
            galleryTimedOut: false
        };
    }
    componentDidMount () {
        fetchGandiLibrary()
            .then(gandiGallery => this.setState({gandiGallery}))
            .catch(error => log.error(error));
        if (!this.state.gallery) {
            const timeout = setTimeout(() => {
                this.setState({
                    galleryTimedOut: true
                });
            }, 750);

            fetchLibrary()
                .then(gallery => {
                    cachedGallery = gallery;
                    this.setState({
                        gallery
                    });
                    clearTimeout(timeout);
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        galleryError: error
                    });
                    clearTimeout(timeout);
                });
        }
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        const url = item.extensionURL ? item.extensionURL : extensionId;
        if (!item.disabled) {
            if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
                this.props.onCategorySelected(extensionId);
            } else if (item.tags && item.tags.includes('gandi')) {
                // Gandi's community scripts use window.tempExt, not the
                // Scratch.extensions.register API required by this loader.
                // Don't leave the user with a spinner or a misleading
                // successful selection: explain the actual incompatibility.
                // eslint-disable-next-line no-alert
                alert(
                    'This Gandi IDE community extension is not compatible with YASM yet. ' +
                    'Its source uses Gandi-specific extension registration/runtime APIs. ' +
                    'It needs to be adapted before it can load safely in YASM.'
                );
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url)
                    .then(() => {
                        this.props.onCategorySelected(extensionId);
                    })
                    .catch(err => {
                        log.error(err);
                        // eslint-disable-next-line no-alert
                        alert(err && err.message ? err.message : String(err));
                    });
            }
        }
    }
    render () {
        let library = null;
        if (this.state.gallery || this.state.galleryError || this.state.galleryTimedOut) {
            library = extensionLibraryContent.map(toLibraryItem);
            library.push('---');
            if (this.state.gandiGallery) {
                library.push(...this.state.gandiGallery.map(toLibraryItem));
                library.push('---');
            }
            if (this.state.gallery) {
                library.push(toLibraryItem(galleryMore));
                const locale = this.props.intl.locale;
                library.push(
                    ...this.state.gallery
                        .filter(i => i.extensionId !== 'faceSensing')
                        .map(i => translateGalleryItem(i, locale))
                        .map(toLibraryItem)
                );
            } else if (this.state.galleryError) {
                library.push(toLibraryItem(galleryError));
            } else {
                library.push(toLibraryItem(galleryLoading));
            }

            // A community extension can also appear in the built-in or
            // TurboWarp catalog. Keep the first card and discard repeated IDs
            // or identical source URLs so a single extension is not shown twice.
            const seenIds = new Set();
            const seenURLs = new Set();
            library = library.filter(item => {
                if (typeof item === 'string' || !item) return true;
                const id = item.extensionId;
                const url = item.extensionURL;
                if ((id && seenIds.has(id)) || (url && seenURLs.has(url))) return false;
                if (id) seenIds.add(id);
                if (url) seenURLs.add(url);
                return true;
            });
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                persistableKey="extensionId"
                id="extensionLibrary"
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);
