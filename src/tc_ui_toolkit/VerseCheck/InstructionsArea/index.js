import React from 'react';
import PropTypes from 'prop-types';
import { Tooltip, Typography } from '@mui/material';

// components
import InstructionsAreaTextSelection, { SelectedText } from '../InstructionsAreaTextSelection';
// css
import './InstructionsArea.styles.css';

function getSelectionString(invalidated, translate) {
  if (invalidated) {
    return (
      <div>
        <Typography>
          {translate('selection_invalidated')}
          <Tooltip
            title={translate('invalidated_tooltip')}
            placement="top"
            arrow
            slotProps={{
              tooltip: {
                sx: {
                  backgroundColor: '#333',     // dark background
                  color: '#fff',                // white text
                  fontSize: '0.8em',
                  borderRadius: '8px',
                  p: 1,
                  boxShadow: 3,
                },
              },
              arrow: {
                sx: { color: '#333' },
              },
            }}
          >
            <Typography component={'strong'}
              sx={{
                verticalAlign: 'super',
                fontSize: '0.8em',
                marginLeft: 4,
                cursor: 'help',
              }}
            >
              1
            </Typography>
          </Tooltip>
        </Typography>
      </div>
    );
  }
}

const InstructionsArea = ({
  mode,
  verseText,
  translate,
  selections,
  invalidated,
  alignedGLText,
  nothingToSelect,
  targetLanguageFont,
  dontShowTranslation,
  targetLanguageDirection,
}) => {
  if (!verseText) {
    return (
      <div className='instructions-area'>
        <Typography>{translate('empty_verse')}</Typography><br />
      </div>
    );
  }

  if (nothingToSelect) { // if nothingToSelect is true
    return (
      <div className='instructions-area'>
        <Typography>{translate('no_selection_needed_description')}</Typography><br />
        <SelectedText>
          <Typography component='span' fontWeight={'bold'} className="no-selection-needed">
            {translate('no_selection_needed')}
          </Typography>
        </SelectedText>
      </div>
    );
  }

  if (selections.length === 0 && dontShowTranslation && !invalidated) { // if invalidated we had previous selection
    return (
      <div className='instructions-area'>
        <Typography>{translate('no_selection')}</Typography><br />
      </div>
    );
  }

  if (mode === 'select' || invalidated) { // if invalidated we had previous selection
    return (
      <div className='instructions-area'>
        {getSelectionString(invalidated, translate)}
        <Typography>{translate('please_select')}</Typography><br />
        <Typography>
          <Typography component='span' fontWeight={'bold'} sx={{ color: 'var(--accent-color)' }}>
            {`${alignedGLText}`}
          </Typography>
        </Typography><br />
      </div>
    );
  }

  return (
    <div className='instructions-area'>
      <Typography>
        <Typography fontWeight={'bold'} component='span' sx={{ color: 'var(--accent-color)' }}>
          {`${alignedGLText}`}
        </Typography>
      </Typography><br />
      <Typography style={{ lineHeight: 2 }}>{translate('translated_as')}</Typography><br />
      <Typography>
        <InstructionsAreaTextSelection
          selections={selections}
          verseText={verseText}
          targetLanguageFont={targetLanguageFont}
          languageDirection={targetLanguageDirection}
        />
      </Typography>
    </div>
  );
};

InstructionsArea.propTypes = {
  translate: PropTypes.func.isRequired,
  alignedGLText: PropTypes.string.isRequired,
  selections: PropTypes.array.isRequired,
  dontShowTranslation: PropTypes.bool,
  verseText: PropTypes.string.isRequired,
  mode: PropTypes.string,
  invalidated: PropTypes.bool,
  nothingToSelect: PropTypes.bool,
  targetLanguageFont: PropTypes.string,
  targetLanguageDirection: PropTypes.string,
};

InstructionsArea.defaultProps = { targetLanguageDirection: 'ltr' };

export default InstructionsArea;
