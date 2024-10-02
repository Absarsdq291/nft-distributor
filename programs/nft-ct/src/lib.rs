pub use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::{
    create_master_edition_v3, create_metadata_accounts_v3, CreateMasterEditionV3,
    CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token::{mint_to, Mint, MintTo, Token, TokenAccount};
use mpl_token_metadata::types::{DataV2, Creator};
use solana_program::{
    sysvar::instructions::get_instruction_relative,
    program_memory::sol_memcmp,
    pubkey::PUBKEY_BYTES
};
use solana_program::sysvar::instructions;

declare_id!("BtKo4Ljr6FDuw6xEzbcji2FwKPaQ2Try5qmyBmosL5kt");

const ALLOWED_PROGRAM_ID: Pubkey = solana_program::pubkey!("9gqCftnKaG2pYswKbM1GfaMU57fptTw893V3bkAXdkJX");

pub fn cmp_pubkeys(a: &Pubkey, b: &Pubkey) -> bool {
    sol_memcmp(a.as_ref(), b.as_ref(), PUBKEY_BYTES) == 0
}

#[program]
pub mod nft_ct {
    use super::*;

    pub fn create_single_nft(
        ctx: Context<CreateNFT>,
        id: u64,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let current_ix = get_instruction_relative(
            0, 
            &ctx.accounts.instruction_sysvar_account.to_account_info()
            ).unwrap();
            
            if !cmp_pubkeys(&current_ix.program_id, &ALLOWED_PROGRAM_ID) {
            return Err(ErrorCode::Unauthorized.into());
            }

        msg!("Creating seeds");
        let id_bytes = id.to_le_bytes();
        let seeds = &[
            "mint".as_bytes(),
            id_bytes.as_ref(),
            &[ctx.bumps.mint],
        ];

        msg!("Run mint_to");
        match mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    authority: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                &[&seeds[..]],
            ),
            1, // 1 token
        ) {
            Ok(_) => msg!("Minted 1 token successfully"),
            Err(e) => {
                msg!("Error during mint_to: {:?}", e);
                return Err(e);
            }
        }

        msg!("Run create metadata accounts v3");

        match create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    payer: ctx.accounts.payer.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    metadata: ctx.accounts.nft_metadata.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                &[&seeds[..]],
            ),
            DataV2 {
                name,
                symbol,
                uri,
                seller_fee_basis_points: 500, // creator will receive 5% royalty on secondary sales
                creators: Some(vec![
                    Creator {
                        address: ctx.accounts.authority.key(),
                        verified: true,
                        share: 100,
                    },
                ]),
                collection: None,
                uses: None,
            },
            true,
            true,
            None,
        ) {
            Ok(_) => msg!("Metadata created successfully"),
            Err(e) => {
                msg!("Error during create_metadata_accounts_v3: {:?}", e);
                return Err(e);
            }
        }

        msg!("Run create master edition v3");

        match create_master_edition_v3(
            CpiContext::new_with_signer(
                ctx.accounts.metadata_program.to_account_info(),
                CreateMasterEditionV3 {
                    edition: ctx.accounts.master_edition_account.to_account_info(),
                    payer: ctx.accounts.payer.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    metadata: ctx.accounts.nft_metadata.to_account_info(),
                    mint_authority: ctx.accounts.authority.to_account_info(),
                    update_authority: ctx.accounts.authority.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                &[&seeds[..]],
            ),
            Some(1),
        ) {
            Ok(_) => msg!("Master edition created successfully"),
            Err(e) => {
                msg!("Error during create_master_edition_v3: {:?}", e);
                return Err(e);
            }
        }

        msg!("Minted NFT successfully");

        Ok(())
    }

}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateNFT<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account( 
    init,
    payer = payer, 
    mint::decimals = 0,
    mint::authority = authority,
    mint::freeze_authority = authority,
    seeds = ["mint".as_bytes(), id.to_le_bytes().as_ref()], 
    bump,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub token_account: Account<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub metadata_program: Program<'info, Metadata>,
    /// CHECK: account constraints checked in account trait
    #[account(address = instructions::id())]
    pub instruction_sysvar_account: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [
            b"metadata".as_ref(),
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
            b"edition".as_ref(),
        ],
        bump,
        seeds::program = metadata_program.key()
    )]
    /// CHECK: Manual validation will be done in the handler
    pub master_edition_account: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [
            b"metadata".as_ref(),
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        seeds::program = metadata_program.key()
    )]
    /// CHECK: Manual validation will be done in the handler
    pub nft_metadata: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access")]
    Unauthorized,
}
